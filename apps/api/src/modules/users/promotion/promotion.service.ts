import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { lockAcademicYearForShare } from '../../academic/academic-locks.js';
import { isYearReadOnly } from '../../academic/academic-policy.js';
import { MSG, mapPrismaError } from '../../academic/academic.errors.js';
import type { Actor } from '../../academic/request-user.js';
import { uuidv7 } from '../import/uuid-v7.js';
import { recordUsers } from '../users-audit.js';
import { lockUsersForUpdateBulk } from '../users-locks.js';
import { closeInstant } from '../users-policy.js';
import {
  countDecisions,
  promotionFingerprint,
  proposePromotion,
  validateDecisions,
  type PromotionCounts,
  type PromotionItem,
  type PromotionSummary,
  type SourceEnrollment,
  type TargetSection,
} from './promotion-policy.js';
import type { PromotionCommitDto } from './promotion.dto.js';
import { PROMOTION_MSG } from './promotion.errors.js';

type Db = Prisma.TransactionClient;

type YearRow = { id: string; year: number; isActive: boolean | null; closedAt: Date | null };

export type PromotionProposal = {
  sourceYear: { id: string; year: number };
  targetYear: { id: string; year: number };
  fingerprint: string;
  /** Secciones activas del destino (para elegir la sección de cada fila). */
  targetSections: TargetSection[];
  items: PromotionItem[];
  summary: PromotionSummary;
  canConfirm: boolean;
};

export type PromotionResult = PromotionCounts & {
  closedEnrollments: number;
  createdEnrollments: number;
};

/** Estado que se compara con la huella: matrículas del origen y secciones del destino. */
type PromotionState = {
  enrollments: (SourceEnrollment & { effectiveFrom: Date })[];
  targetSections: TargetSection[];
  alreadyEnrolled: Set<string>;
};

/** La transacción puede escribir hasta 2000 matrículas cerradas y otras tantas nuevas. */
const PROMOTION_TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;
const BATCH_SIZE = 500;

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** P2028 (tiempo de la transacción agotado) también es 409: no se escribió nada. */
function mapPromotionError(error: unknown): never {
  if ((error as { code?: unknown } | null)?.code === 'P2028') {
    throw new ConflictException(MSG.conflict);
  }
  return mapPrismaError(error, MSG.conflict);
}

/**
 * RF-16 / RN-15: promoción en bloque propuesta por el sistema y confirmada por el admin (INFORME 1
 * de F6, regla B). Sin estado: la propuesta se recalcula en cada lectura y la confirmación lleva
 * la huella. D-038: es la única escritura permitida sobre un año origen cerrado o de solo lectura
 * y solo cierra matrículas vigentes con YEAR_END (notas y contenidos no se tocan, RN-14).
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async proposal(targetId: string, sourceYearId: string): Promise<PromotionProposal> {
    const { source, target } = await this.readYears(targetId, sourceYearId);
    await this.assertPreconditions(this.prisma, source, target);
    const state = await this.readState(this.prisma, source.id, target.id);
    const proposal = proposePromotion(
      state.enrollments,
      state.targetSections,
      state.alreadyEnrolled,
    );
    return {
      sourceYear: { id: source.id, year: source.year },
      targetYear: { id: target.id, year: target.year },
      fingerprint: fingerprintOf(state),
      targetSections: state.targetSections,
      ...proposal,
    };
  }

  /**
   * Confirmación todo o nada. Orden de bloqueos (regla B9): (1) estudiantes FOR UPDATE en una
   * consulta; (2) años FOR SHARE de menor a mayor (origen y destino); (3) secciones del destino
   * FOR SHARE. Luego se recalcula la huella (409 si cambió), se validan las decisiones (422) y se
   * escribe: updateMany condicionado a isCurrent TRUE con conteo exacto (409 si no) y createMany.
   */
  async commit(targetId: string, dto: PromotionCommitDto, actor: Actor): Promise<PromotionResult> {
    const { source, target } = await this.readYears(targetId, dto.sourceYearId);
    await this.assertPreconditions(this.prisma, source, target);
    // Ids leídos sin bloqueo; dentro de la transacción se bloquean y todo se vuelve a leer.
    const studentIds = (
      await this.prisma.enrollment.findMany({
        where: { academicYearId: source.id, isCurrent: true },
        select: { studentId: true },
      })
    ).map((e) => e.studentId);
    const now = new Date();

    const outcome = await this.prisma
      .$transaction(async (tx) => {
        // (1) Estudiantes.
        await lockUsersForUpdateBulk(tx, studentIds);
        // (2) Años, de menor a mayor (el origen es el año anterior al destino).
        const lockedSource = await lockAcademicYearForShare(tx, source.id);
        const lockedTarget = await lockAcademicYearForShare(tx, target.id);
        if (!lockedSource) throw new NotFoundException(PROMOTION_MSG.sourceNotFound);
        if (!lockedTarget) throw new NotFoundException(PROMOTION_MSG.targetNotFound);
        // (3) Secciones del destino.
        await tx.$queryRaw`
          SELECT id FROM Section WHERE academicYearId = ${target.id} ORDER BY id FOR SHARE`;

        await this.assertPreconditions(tx, lockedSource, lockedTarget);
        const state = await this.readState(tx, source.id, target.id);
        if (fingerprintOf(state) !== dto.fingerprint) {
          throw new ConflictException(PROMOTION_MSG.fingerprintChanged);
        }
        const { items } = proposePromotion(
          state.enrollments,
          state.targetSections,
          state.alreadyEnrolled,
        );
        const { issues, decisions } = validateDecisions(items, state.targetSections, dto.decisions);
        if (issues.length > 0) throw new UnprocessableEntityException({ message: issues });

        // Cierre: PROMOTE, REPEAT y GRADUATE. effectiveTo = max(ahora, effectiveFrom).
        const fromById = new Map(state.enrollments.map((e) => [e.enrollmentId, e.effectiveFrom]));
        const toClose = decisions.filter((d) => d.action !== 'EXCLUDE').map((d) => d.enrollmentId);
        const closeNow = toClose.filter((id) => fromById.get(id)! <= now);
        const closeLater = toClose.filter((id) => fromById.get(id)! > now);
        let closed = 0;
        for (const batch of chunks(closeNow, BATCH_SIZE)) {
          const { count } = await tx.enrollment.updateMany({
            // academicYearId: defensa en profundidad, solo se cierran matrículas del origen.
            where: { id: { in: batch }, academicYearId: source.id, isCurrent: true },
            data: { isCurrent: null, effectiveTo: now, endReason: 'YEAR_END' },
          });
          closed += count;
        }
        for (const id of closeLater) {
          const { count } = await tx.enrollment.updateMany({
            where: { id, academicYearId: source.id, isCurrent: true },
            data: {
              isCurrent: null,
              effectiveTo: closeInstant(now, fromById.get(id)!),
              endReason: 'YEAR_END',
            },
          });
          closed += count;
        }
        if (closed !== toClose.length) throw new ConflictException(MSG.conflict);

        // Altas: PROMOTE y REPEAT en el destino, vigentes desde ahora.
        const created = decisions
          .filter((d) => d.action === 'PROMOTE' || d.action === 'REPEAT')
          .map((d) => ({
            id: uuidv7(),
            studentId: d.studentId,
            sectionId: d.sectionId!,
            academicYearId: target.id,
            isCurrent: true,
            effectiveFrom: now,
          }));
        for (const batch of chunks(created, BATCH_SIZE)) {
          await tx.enrollment.createMany({ data: batch });
        }
        return {
          counts: countDecisions(decisions),
          closedIds: toClose,
          createdIds: created.map((c) => c.id),
        };
      }, PROMOTION_TX_OPTIONS)
      .catch(mapPromotionError);

    // Bitácora después del commit, solo ids y conteos (nunca nombres ni correos).
    await recordUsers(this.audit, actor, 'promotion.commit', 'AcademicYear', target.id, {
      after: {
        sourceYearId: source.id,
        ...outcome.counts,
        closedEnrollmentIds: outcome.closedIds,
        createdEnrollmentIds: outcome.createdIds,
      },
    });
    return {
      ...outcome.counts,
      closedEnrollments: outcome.closedIds.length,
      createdEnrollments: outcome.createdIds.length,
    };
  }

  /** 422 si es el mismo año; 404 si no existe el destino o el origen. */
  private async readYears(
    targetId: string,
    sourceYearId: string,
  ): Promise<{ source: YearRow; target: YearRow }> {
    if (targetId === sourceYearId) throw new UnprocessableEntityException(PROMOTION_MSG.sameYear);
    const [target, source] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { id: targetId } }),
      this.prisma.academicYear.findUnique({ where: { id: sourceYearId } }),
    ]);
    if (!target) throw new NotFoundException(PROMOTION_MSG.targetNotFound);
    if (!source) throw new NotFoundException(PROMOTION_MSG.sourceNotFound);
    return { source, target };
  }

  /**
   * Regla B2: destino = origen + 1 (422); origen con sus períodos cerrados (422; el origen puede
   * estar cerrado); destino sin cerrar y no de solo lectura (409); destino con al menos una
   * sección activa (422).
   */
  private async assertPreconditions(db: Db, source: YearRow, target: YearRow): Promise<void> {
    if (target.year !== source.year + 1) {
      throw new UnprocessableEntityException(PROMOTION_MSG.notConsecutive);
    }
    const openPeriods = await db.academicPeriod.count({
      where: { academicYearId: source.id, closedAt: null },
    });
    if (openPeriods > 0) throw new UnprocessableEntityException(PROMOTION_MSG.openPeriods);
    if (target.closedAt !== null) throw new ConflictException(PROMOTION_MSG.targetClosed);
    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { year: true },
    });
    if (isYearReadOnly(target, activeYear)) {
      throw new ConflictException(PROMOTION_MSG.targetReadOnly);
    }
    const activeSections = await db.section.count({
      where: { academicYearId: target.id, isActive: true },
    });
    if (activeSections === 0) {
      throw new UnprocessableEntityException(PROMOTION_MSG.noTargetSections);
    }
  }

  private async readState(db: Db, sourceId: string, targetId: string): Promise<PromotionState> {
    const rows = await db.enrollment.findMany({
      where: { academicYearId: sourceId, isCurrent: true },
      select: {
        id: true,
        studentId: true,
        effectiveFrom: true,
        student: { select: { fullName: true, status: true } },
        section: { select: { id: true, gradeLevel: true, code: true } },
      },
    });
    const targetSections = await db.section.findMany({
      where: { academicYearId: targetId, isActive: true },
      select: { id: true, gradeLevel: true, code: true },
      orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
    });
    const studentIds = rows.map((r) => r.studentId);
    const already =
      studentIds.length === 0
        ? []
        : await db.enrollment.findMany({
            where: { academicYearId: targetId, isCurrent: true, studentId: { in: studentIds } },
            select: { studentId: true },
          });
    return {
      enrollments: rows.map((r) => ({
        enrollmentId: r.id,
        studentId: r.studentId,
        fullName: r.student.fullName,
        status: r.student.status,
        section: r.section,
        effectiveFrom: r.effectiveFrom,
      })),
      targetSections,
      alreadyEnrolled: new Set(already.map((a) => a.studentId)),
    };
  }
}

const fingerprintOf = (state: PromotionState): string =>
  promotionFingerprint(state.enrollments, state.targetSections, state.alreadyEnrolled);
