import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { recordAcademic } from './academic-audit.js';
import {
  cloneYearIssue,
  planClone,
  teacherIdsToCheck,
  type CloneCreated,
  type CloneSkipped,
} from './academic-clone-policy.js';
import {
  lockAcademicYearForShare,
  lockAcademicYearRow,
  lockUsersForShare,
} from './academic-locks.js';
import { isYearReadOnly } from './academic-policy.js';
import { toSummary, type YearSummary } from './academic-years.service.js';
import type { CloneStructureDto } from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import type { Actor } from './request-user.js';

export type CloneStructureResult = {
  targetYear: YearSummary;
  sourceYearId: string;
  created: CloneCreated;
  skipped: CloneSkipped;
};

/**
 * RF-15: clona la estructura (secciones y curso-sección) de un año anterior en un año destino
 * vacío (INFORME 1 de F6, regla A). No copia períodos (el destino ya los tiene, RF-09),
 * matrículas, vínculos ni contenidos.
 */
@Injectable()
export class AcademicCloneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async cloneStructure(
    targetId: string,
    dto: CloneStructureDto,
    actor: Actor,
  ): Promise<CloneStructureResult> {
    const { sourceYearId, copyTeachers } = dto;
    if (sourceYearId === targetId) throw new UnprocessableEntityException(MSG.cloneSameYear);

    // Lectura previa sin bloqueo: 404 y orden de los bloqueos (menor a mayor año).
    const [target, source] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { id: targetId } }),
      this.prisma.academicYear.findUnique({ where: { id: sourceYearId } }),
    ]);
    if (!target) throw new NotFoundException(MSG.yearNotFound);
    if (!source) throw new NotFoundException(MSG.sourceYearNotFound);
    if (cloneYearIssue(source, target)) {
      throw new UnprocessableEntityException(MSG.cloneSourceNotEarlier);
    }

    // Con copyTeachers: docentes candidatos leídos sin bloqueo; dentro se bloquean primero.
    const candidates = copyTeachers
      ? teacherIdsToCheck(await this.readSourceStructure(this.prisma, sourceYearId))
      : [];

    const result = await this.prisma
      .$transaction(async (tx) => {
        // 0) Docentes FOR SHARE en orden de id, con su rol y estado actuales (orden del
        //    proyecto: User → AcademicYear; hallazgo MEDIO 1 de seguridad de 6a).
        const lockedTeachers = await lockUsersForShare(tx, candidates);
        const eligibleTeacherIds = new Set(
          lockedTeachers
            .filter((u) => u.role === 'TEACHER' && u.status === 'ACTIVE')
            .map((u) => u.id),
        );

        // 1) Bloqueos de menor a mayor año: origen FOR SHARE, destino FOR UPDATE. El número de
        //    año no cambia mientras el año tenga secciones, y el origen las tiene si se clona.
        const lockedSource = await lockAcademicYearForShare(tx, sourceYearId);
        if (!lockedSource) throw new NotFoundException(MSG.sourceYearNotFound);
        const lockedTarget = await lockAcademicYearRow(tx, targetId);
        if (!lockedTarget) throw new NotFoundException(MSG.yearNotFound);
        if (cloneYearIssue(lockedSource, lockedTarget)) {
          throw new UnprocessableEntityException(MSG.cloneSourceNotEarlier);
        }

        // 2) Destino editable (D-030) y vacío, con datos leídos después de los bloqueos.
        if (lockedTarget.closedAt !== null) throw new ConflictException(MSG.yearClosed);
        const activeYear = await tx.academicYear.findFirst({
          where: { isActive: true },
          select: { year: true },
        });
        if (isYearReadOnly(lockedTarget, activeYear)) {
          throw new ConflictException(MSG.readOnlyYear);
        }
        const existing = await tx.section.count({ where: { academicYearId: targetId } });
        if (existing > 0) throw new ConflictException(MSG.cloneTargetHasSections);

        // 3) Estructura del origen y plan (lógica pura). Si aparece un docente que no se
        //    bloqueó (el origen cambió entre la lectura previa y la transacción) → 409.
        const sections = await this.readSourceStructure(tx, sourceYearId);
        if (copyTeachers) {
          const locked = new Set(candidates);
          if (teacherIdsToCheck(sections).some((id) => !locked.has(id))) {
            throw new ConflictException(MSG.conflict);
          }
        }
        const plan = planClone(sections, { copyTeachers, eligibleTeacherIds });
        if (plan.sections.length === 0) {
          throw new UnprocessableEntityException(MSG.cloneSourceEmpty);
        }

        // 4) Escrituras: cada sección con sus curso-sección en una escritura anidada.
        for (const section of plan.sections) {
          await tx.section.create({
            data: {
              academicYearId: targetId,
              level: section.level,
              gradeLevel: section.gradeLevel,
              code: section.code,
              courseSections:
                section.courseSections.length > 0
                  ? { createMany: { data: section.courseSections } }
                  : undefined,
            },
            select: { id: true },
          });
        }
        return { plan, lockedTarget, activeYear };
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.cloneTargetHasSections));

    const { plan, lockedTarget, activeYear } = result;
    // Bitácora después del commit, solo ids, banderas y conteos (sin nombres).
    await recordAcademic(this.audit, actor, 'year.clone_structure', 'AcademicYear', targetId, {
      after: { sourceYearId, copyTeachers, created: plan.created, skipped: plan.skipped },
    });
    return {
      targetYear: toSummary(
        { ...lockedTarget, isActive: lockedTarget.isActive ? true : null },
        activeYear,
      ),
      sourceYearId,
      created: plan.created,
      skipped: plan.skipped,
    };
  }

  private readSourceStructure(db: Prisma.TransactionClient, sourceYearId: string) {
    return db.section.findMany({
      where: { academicYearId: sourceYearId },
      select: {
        level: true,
        gradeLevel: true,
        code: true,
        isActive: true,
        courseSections: {
          select: {
            courseId: true,
            teacherId: true,
            isActive: true,
            course: { select: { isActive: true } },
          },
        },
      },
    });
  }
}
