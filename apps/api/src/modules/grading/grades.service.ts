import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { isDeadlock, mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { assertCanWriteCourseSection, lockOpenPeriod } from '../contents/contents-guards.js';
import { SubmissionsReadService } from '../submissions/submissions-read.service.js';
import { recordGrading } from './grading-audit.js';
import { GradingEventPublisher } from './grading-events.js';
import type { GradeInputDto } from './grading.dto.js';
import {
  auditState,
  changedFields,
  decideManualGrade,
  decimalText,
  GRADE_ERRORS,
  type GradeRow,
} from './grading.policy.js';
import type { GradeView } from './grading.types.js';

export const GRADES_MSG = {
  enrollmentNotFound: 'La matrícula no existe',
  busy: 'Otra calificación se está registrando a la vez; vuelve a intentarlo',
} as const;

const MAX_ATTEMPTS = 3;

type StoredGrade = GradeRow & {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  gradedAt: Date;
  updatedAt: Date;
};

type LockedEnrollment = {
  sectionId: string;
  isCurrent: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type TxResult = { before: StoredGrade | null; after: StoredGrade; changed: string[] };

const gradeSelect = {
  id: true,
  assignmentId: true,
  enrollmentId: true,
  state: true,
  value: true,
  comment: true,
  exemptionReason: true,
  source: true,
  gradedAt: true,
  updatedAt: true,
} as const;

const retriable = (error: unknown): boolean => {
  if (isDeadlock(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
};

const toStored = (g: {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  state: GradeRow['state'];
  value: { toFixed(d: number): string } | null;
  comment: string | null;
  exemptionReason: string | null;
  source: GradeRow['source'];
  gradedAt: Date;
  updatedAt: Date;
}): StoredGrade => ({ ...g, value: decimalText(g.value) });

export const toGradeView = (g: StoredGrade): GradeView => ({
  id: g.id,
  assignmentId: g.assignmentId,
  enrollmentId: g.enrollmentId,
  state: g.state,
  value: g.value,
  comment: g.comment,
  exemptionReason: g.exemptionReason,
  source: g.source,
  gradedAt: g.gradedAt.toISOString(),
  updatedAt: g.updatedAt.toISOString(),
});

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly submissions: SubmissionsReadService,
    private readonly events: GradingEventPublisher,
  ) {}

  /**
   * PUT /grades/:assignmentId/:enrollmentId (RF-41, RF-42, RF-45, RF-46, RF-50).
   * Docente asignado o ADMIN (modo soporte, queda en la bitácora). 404 tarea o matrícula;
   * 403 sin permiso; 409 período o año cerrado (RN-10); 422 con code NO_SUBMISSION,
   * HAS_SUBMISSION, NOT_OVERDUE, ENROLLMENT_OUT_OF_SECTION o ENROLLMENT_NOT_ELIGIBLE.
   */
  async put(
    assignmentId: string,
    enrollmentId: string,
    input: GradeInputDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<GradeView> {
    const assignment = await this.submissions.getAssignmentForGrading(assignmentId);
    await assertCanWriteCourseSection(this.access, user, assignment.courseSectionId);

    const [enrollment, cs] = await Promise.all([
      this.prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { sectionId: true }, // comprobación previa; la decisión usa la relectura en putInTx
      }),
      this.prisma.courseSection.findUniqueOrThrow({
        where: { id: assignment.courseSectionId },
        select: { sectionId: true },
      }),
    ]);
    if (!enrollment) throw new NotFoundException(GRADES_MSG.enrollmentNotFound);
    if (enrollment.sectionId !== cs.sectionId) this.reject('ENROLLMENT_OUT_OF_SECTION');

    // 409 antes de las reglas de negocio: con el período cerrado no se califica (RF-50).
    await this.access.assertCourseSectionWritable(assignment.courseSectionId, assignment.periodId);

    const result = await this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const r = await this.putInTx(tx, assignment, enrollmentId, cs.sectionId, input);
        // D-047: la bitácora va en la misma transacción que la nota.
        if (r.changed.length > 0) {
          await recordGrading(
            this.audit,
            actor,
            r.before ? 'grade.update' : 'grade.create',
            r.after.id,
            {
              before: r.before ? auditState(r.before) : null,
              after: auditState(r.after),
              changedFields: r.changed,
              assignmentId,
              enrollmentId,
            },
            tx,
          );
        }
        return r;
      }),
    );

    if (result.changed.length > 0) {
      this.events.publish({
        type: 'grade.updated.v1',
        payload: {
          gradeId: result.after.id,
          assignmentId,
          enrollmentId,
          courseSectionId: assignment.courseSectionId,
          gradeStatus: result.after.state,
          source: result.after.source,
          updatedAt: result.after.updatedAt.toISOString(),
        },
      });
    }
    return toGradeView(result.after);
  }

  private async putInTx(
    tx: Prisma.TransactionClient,
    assignment: { id: string; periodId: string; dueAt: string; noSubmissionGrade: string },
    enrollmentId: string,
    sectionId: string,
    input: GradeInputDto,
  ): Promise<TxResult> {
    // Orden de bloqueos (igual que submissions): AcademicPeriod FOR SHARE → Enrollment FOR SHARE.
    await lockOpenPeriod(tx, assignment.periodId);
    // Seguridad (INFORME 6, MEDIO 2): la matrícula se relee bloqueada dentro de la transacción;
    // un traslado o retiro concurrente espera y no se decide con datos viejos.
    const [enrollment] = await tx.$queryRaw<LockedEnrollment[]>`
      SELECT sectionId, isCurrent, effectiveFrom, effectiveTo
      FROM Enrollment WHERE id = ${enrollmentId} FOR SHARE`;
    if (!enrollment) throw new NotFoundException(GRADES_MSG.enrollmentNotFound);
    if (enrollment.sectionId !== sectionId) this.reject('ENROLLMENT_OUT_OF_SECTION');
    const [submission, existing] = await Promise.all([
      tx.submission.findFirst({
        where: { assignmentId: assignment.id, enrollmentId, versions: { some: {} } },
        select: { id: true },
      }),
      tx.grade.findUnique({
        where: { assignmentId_enrollmentId: { assignmentId: assignment.id, enrollmentId } },
        select: gradeSelect,
      }),
    ]);
    const now = new Date();
    const decision = decideManualGrade({
      input,
      hasSubmission: submission !== null,
      dueAt: new Date(assignment.dueAt),
      now,
      noSubmissionGrade: assignment.noSubmissionGrade,
      enrollment: {
        isCurrent: Number(enrollment.isCurrent) === 1,
        effectiveFrom: new Date(enrollment.effectiveFrom),
        effectiveTo: enrollment.effectiveTo === null ? null : new Date(enrollment.effectiveTo),
      },
    });
    if (!decision.ok) this.reject(decision.code);

    const before = existing ? toStored(existing) : null;
    const changed = changedFields(before, decision.row);
    if (before && changed.length === 0) return { before, after: before, changed };

    const data = { ...decision.row, gradedAt: now };
    const saved = before
      ? await tx.grade.update({ where: { id: before.id }, data, select: gradeSelect })
      : await tx.grade.create({
          data: { ...data, assignmentId: assignment.id, enrollmentId },
          select: gradeSelect,
        });
    return { before, after: toStored(saved), changed };
  }

  private reject(code: keyof typeof GRADE_ERRORS): never {
    throw new UnprocessableEntityException({ code, message: GRADE_ERRORS[code] });
  }

  /** Reintenta ante una escritura concurrente (P2002 de la NE AUTO, bloqueo mutuo). */
  private async withRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (error: unknown) {
        if (!retriable(error)) return mapPrismaError(error);
        if (attempt >= MAX_ATTEMPTS) throw new ConflictException(GRADES_MSG.busy);
      }
    }
  }
}
