import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService, type AuditTx, type AuditEvent } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { isDeadlock, mapPrismaError, MSG as ACADEMIC_MSG } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { ContentsEventPublisher } from '../contents/contents-events.js';
import { assertCanWriteCourseSection, lockOpenPeriod } from '../contents/contents-guards.js';
import { computeDisplayStatus } from './display-status.js';
import {
  evaluateTiming,
  nextVersionNumber,
  toReceipt,
  toReceipts,
  type VersionRow,
} from './submissions.policy.js';
import type {
  MySubmissionView,
  SubmissionAccepted,
  SubmissionVersionsView,
  TeacherSubmissionItem,
} from './submissions.types.js';

export const SUBMISSION_MSG = {
  assignmentNotFound: 'La tarea no existe',
  submissionNotFound: 'La entrega no existe',
  notEnrolled: 'No tienes una matrícula vigente en este curso',
  invalidFile: 'El archivo no es válido para esta entrega',
  fileUsedElsewhere: 'El archivo ya se usó en otra entrega',
  lateNotAllowed: 'El plazo de entrega venció y la tarea no admite entregas tardías',
  busy: 'Otra entrega se está registrando a la vez; vuelve a intentarlo',
} as const;

const MAX_ATTEMPTS = 3;
const logger = new Logger('SubmissionsAudit');

const versionInclude = {
  file: { select: { id: true, originalName: true, sizeBytes: true, sha256: true } },
} as const;

type LockedAssignment = {
  deletedAt: Date | null;
  dueAt: Date;
  allowLate: unknown;
  courseSectionId: string;
  periodId: string;
};

type LockedFile = {
  purpose: string;
  assignmentId: string | null;
  courseSectionId: string;
  uploadedById: string;
  uploadStatus: string;
  scanStatus: string;
  purgedAt: Date | null;
  completedAt: Date | null;
};

const retriable = (error: unknown): boolean => {
  if (isDeadlock(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
};

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly events: ContentsEventPublisher,
  ) {}

  /**
   * RF-33/36/37: entrega o reentrega de un PDF limpio ya confirmado (fase 3b). Crea la Submission
   * si no existe y una SubmissionVersion con versionNumber + 1. El mismo fileId otra vez devuelve
   * la misma versión (`created: false` → 200). Orden de bloqueos del módulo: AcademicPeriod
   * (FOR SHARE) → Assignment (FOR SHARE) → Enrollment (FOR UPDATE) → StoredFile (FOR UPDATE).
   */
  async submit(
    assignmentId: string,
    fileId: string,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<{ created: boolean; body: SubmissionAccepted }> {
    const assignment = await this.findAssignmentOrFail(assignmentId);
    const enrollmentId = await this.currentEnrollmentOf(user, assignment.courseSectionId);

    // Idempotencia antes de RN-10: repetir una entrega ya hecha no falla aunque el período cierre.
    const replay = await this.findVersionByFile(fileId, assignmentId, enrollmentId);
    if (replay) return { created: false, body: this.accepted(replay, assignment) };

    await this.access.assertCourseSectionWritable(assignment.courseSectionId, assignment.periodId);

    const result = await this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const r = await this.submitInTx(
          tx,
          assignmentId,
          assignment.periodId,
          fileId,
          enrollmentId,
          user.id,
        );
        // D-047: la bitácora va en la misma transacción que la versión.
        if (r.created) await this.recordVersion(actor, assignmentId, enrollmentId, r.version, tx);
        return r;
      }),
    );

    const view = this.accepted(result.version, { id: assignmentId, dueAt: result.dueAt });
    if (result.created) {
      this.events.publish({
        type: 'submission.accepted.v1',
        payload: {
          assignmentId,
          courseSectionId: assignment.courseSectionId,
          enrollmentId,
          submissionId: result.version.submissionId,
          versionId: result.version.id,
          versionNumber: result.version.versionNumber,
          receivedAt: view.receivedAt,
          isLate: view.isLate,
        },
      });
    }
    return { created: result.created, body: view };
  }

  // RF-36/38/39: historial propio, estado y constancia (estudiante con matrícula vigente).
  async mine(assignmentId: string, user: AuthenticatedUser): Promise<MySubmissionView> {
    const assignment = await this.findAssignmentOrFail(assignmentId);
    const enrollmentId = await this.currentEnrollmentOf(user, assignment.courseSectionId);
    const submission = await this.prisma.submission.findUnique({
      where: { assignmentId_enrollmentId: { assignmentId, enrollmentId } },
      include: { versions: { include: versionInclude } },
    });
    const versions = submission ? toReceipts(submission.versions, assignment) : [];
    const latest = versions[0] ?? null;
    const display = computeDisplayStatus({
      latestVersion: latest,
      gradeState: null, // Dev 4 completará con Grade.state
      dueAt: assignment.dueAt,
      allowLate: assignment.allowLate,
      now: new Date(),
    });
    return {
      assignment: {
        id: assignment.id,
        dueAt: assignment.dueAt.toISOString(),
        allowLate: assignment.allowLate,
        maxSizeBytes: assignment.maxSizeBytes,
      },
      submissionId: submission?.id ?? null,
      displayStatus: display.status,
      isLate: display.isLate,
      isOverdue: display.isOverdue,
      latestVersion: latest,
      versions,
    };
  }

  // RF-36/39: historial de una entrega (alumno dueño, docente asignado o ADMIN).
  async versions(submissionId: string, user: AuthenticatedUser): Promise<SubmissionVersionsView> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        enrollment: { select: { studentId: true } },
        assignment: { select: { id: true, dueAt: true, deletedAt: true, courseSectionId: true } },
        versions: { include: versionInclude },
      },
    });
    if (!submission || submission.assignment.deletedAt !== null) {
      throw new NotFoundException(SUBMISSION_MSG.submissionNotFound);
    }
    if (user.role === 'STUDENT') {
      // El dueño ve su historial aunque luego lo trasladen (RN-14), si sigue ACTIVE.
      if (submission.enrollment.studentId !== user.id) {
        throw new ForbiddenException(ACADEMIC_MSG.forbidden);
      }
      await this.assertActive(user.id);
    } else {
      await assertCanWriteCourseSection(this.access, user, submission.assignment.courseSectionId);
    }
    return {
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
      enrollmentId: submission.enrollmentId,
      versions: toReceipts(submission.versions, submission.assignment),
    };
  }

  // Lista del docente (INFORME 1): una fila por matrícula vigente de la sección.
  async listForTeacher(
    assignmentId: string,
    user: AuthenticatedUser,
  ): Promise<{ items: TeacherSubmissionItem[]; total: number }> {
    const assignment = await this.findAssignmentOrFail(assignmentId);
    await assertCanWriteCourseSection(this.access, user, assignment.courseSectionId);
    const cs = await this.prisma.courseSection.findUniqueOrThrow({
      where: { id: assignment.courseSectionId },
      select: { sectionId: true },
    });
    const enrollments = await this.access.listCurrentEnrollments(cs.sectionId);
    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: {
        versions: {
          select: { id: true, versionNumber: true, receivedAt: true, isLate: true, fileId: true },
        },
      },
    });
    const byEnrollment = new Map(submissions.map((s) => [s.enrollmentId, s]));
    const now = new Date();
    const items = enrollments.map((e): TeacherSubmissionItem => {
      const s = byEnrollment.get(e.enrollmentId);
      const latest = s?.versions.reduce<(typeof s.versions)[number] | null>(
        (best, v) => (best === null || v.versionNumber > best.versionNumber ? v : best),
        null,
      );
      const display = computeDisplayStatus({
        latestVersion: latest ?? null,
        gradeState: null,
        dueAt: assignment.dueAt,
        allowLate: assignment.allowLate,
        now,
      });
      return {
        enrollmentId: e.enrollmentId,
        studentId: e.studentId,
        fullName: e.fullName,
        submissionId: s?.id ?? null,
        latestVersion: latest
          ? {
              versionId: latest.id,
              versionNumber: latest.versionNumber,
              receivedAt: latest.receivedAt.toISOString(),
              isLate: latest.isLate,
              fileId: latest.fileId,
            }
          : null,
        versionCount: s?.versions.length ?? 0,
        displayStatus: display.status,
      };
    });
    return { items, total: items.length };
  }

  private async submitInTx(
    tx: Prisma.TransactionClient,
    assignmentId: string,
    periodId: string,
    fileId: string,
    enrollmentId: string,
    studentId: string,
  ): Promise<{ created: boolean; version: VersionRow; dueAt: Date }> {
    // Solo lecturas con bloqueo hasta crear la versión: ven siempre el último commit.
    await lockOpenPeriod(tx, periodId);
    const [assignment] = await tx.$queryRaw<LockedAssignment[]>`
      SELECT deletedAt, dueAt, allowLate, courseSectionId, periodId
      FROM Assignment WHERE id = ${assignmentId} FOR SHARE`;
    if (!assignment || assignment.deletedAt !== null) {
      throw new NotFoundException(SUBMISSION_MSG.assignmentNotFound);
    }

    // La matrícula bloqueada serializa las entregas del mismo estudiante (y confirma que sigue
    // vigente si hubo un traslado a la vez). Entregas de estudiantes distintos no se esperan.
    const [enrollment] = await tx.$queryRaw<{ isCurrent: unknown }[]>`
      SELECT isCurrent FROM Enrollment WHERE id = ${enrollmentId} FOR UPDATE`;
    if (!enrollment || Number(enrollment.isCurrent) !== 1) {
      throw new ForbiddenException(SUBMISSION_MSG.notEnrolled);
    }

    const [file] = await tx.$queryRaw<LockedFile[]>`
      SELECT purpose, assignmentId, courseSectionId, uploadedById, uploadStatus, scanStatus,
             purgedAt, completedAt
      FROM StoredFile WHERE id = ${fileId} FOR UPDATE`;
    const usable =
      file !== undefined &&
      file.purpose === 'SUBMISSION' &&
      file.assignmentId === assignmentId &&
      file.courseSectionId === assignment.courseSectionId &&
      file.uploadedById === studentId &&
      file.uploadStatus === 'COMPLETED' &&
      file.scanStatus === 'CLEAN' &&
      file.purgedAt === null &&
      file.completedAt !== null;
    if (!usable) throw new UnprocessableEntityException(SUBMISSION_MSG.invalidFile);

    // Desde aquí, lecturas normales: la instantánea de InnoDB se fija en la primera, ya con los
    // bloqueos tomados, así ven el último commit. No se usan FOR UPDATE sobre filas que pueden no
    // existir (bloqueos de hueco entre estudiantes distintos provocan bloqueos mutuos).
    const used = await tx.submissionVersion.findUnique({
      where: { fileId },
      include: { ...versionInclude, submission: { select: { enrollmentId: true } } },
    });
    if (used) {
      // Archivo de otro alumno: el mismo 422 genérico, sin revelar que ya se entregó (INFORME 12).
      if (used.submission.enrollmentId !== enrollmentId) {
        throw new UnprocessableEntityException(SUBMISSION_MSG.invalidFile);
      }
      return { created: false, version: used, dueAt: assignment.dueAt };
    }

    // D-006: la hora de entrega es la del servidor al confirmar la subida.
    const receivedAt = file.completedAt!;
    const timing = evaluateTiming(receivedAt, assignment.dueAt, Number(assignment.allowLate) === 1);
    if (!timing.accepted) throw new ConflictException(SUBMISSION_MSG.lateNotAllowed);

    const submission =
      (await tx.submission.findUnique({
        where: { assignmentId_enrollmentId: { assignmentId, enrollmentId } },
        select: { id: true },
      })) ??
      (await tx.submission.create({ data: { assignmentId, enrollmentId }, select: { id: true } }));
    const max = await tx.submissionVersion.aggregate({
      where: { submissionId: submission.id },
      _max: { versionNumber: true },
    });

    const version = await tx.submissionVersion.create({
      data: {
        submissionId: submission.id,
        versionNumber: nextVersionNumber(max._max.versionNumber),
        fileId,
        receivedAt,
        isLate: timing.isLate,
      },
      include: versionInclude,
    });
    await tx.submission.update({ where: { id: submission.id }, data: { updatedAt: new Date() } });
    return { created: true, version, dueAt: assignment.dueAt };
  }

  /**
   * Reintenta la transaccion si choca con otra entrega concurrente (unico de versionNumber o de
   * Submission, bloqueo mutuo). Tras MAX_ATTEMPTS responde 409. Otros errores se traducen.
   */
  private async withRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (error: unknown) {
        if (!retriable(error)) return mapPrismaError(error);
        if (attempt >= MAX_ATTEMPTS) throw new ConflictException(SUBMISSION_MSG.busy);
      }
    }
  }

  private accepted(
    version: VersionRow,
    assignment: { id: string; dueAt: Date },
  ): SubmissionAccepted {
    const receipt = toReceipt(version, assignment, true);
    return {
      submissionId: version.submissionId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      receivedAt: receipt.receivedAt,
      isLate: version.isLate,
      receipt,
    };
  }

  /** Versión ya creada con ese archivo para esta matrícula y tarea (idempotencia), o null. */
  private async findVersionByFile(
    fileId: string,
    assignmentId: string,
    enrollmentId: string,
  ): Promise<VersionRow | null> {
    const version = await this.prisma.submissionVersion.findUnique({
      where: { fileId },
      include: {
        ...versionInclude,
        submission: { select: { assignmentId: true, enrollmentId: true } },
      },
    });
    if (!version) return null;
    // Archivo de otro alumno: el mismo 422 genérico que un archivo inválido (sin oráculo, INFORME 12).
    if (version.submission.enrollmentId !== enrollmentId) {
      throw new UnprocessableEntityException(SUBMISSION_MSG.invalidFile);
    }
    // Archivo propio ya entregado en otra tarea: 409 (no revela nada ajeno).
    if (version.submission.assignmentId !== assignmentId) {
      throw new ConflictException(SUBMISSION_MSG.fileUsedElsewhere);
    }
    return version;
  }

  /** Matrícula vigente del estudiante en la sección del curso (403 si no la tiene o no está ACTIVE). */
  private async currentEnrollmentOf(
    user: AuthenticatedUser,
    courseSectionId: string,
  ): Promise<string> {
    await this.access.assertCanAccessCourseSection(user, courseSectionId);
    const cs = await this.prisma.courseSection.findUniqueOrThrow({
      where: { id: courseSectionId },
      select: { sectionId: true },
    });
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: user.id, sectionId: cs.sectionId, isCurrent: true },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException(SUBMISSION_MSG.notEnrolled);
    return enrollment.id;
  }

  private async findAssignmentOrFail(id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        courseSectionId: true,
        periodId: true,
        dueAt: true,
        allowLate: true,
        maxSizeBytes: true,
      },
    });
    if (!assignment) throw new NotFoundException(SUBMISSION_MSG.assignmentNotFound);
    return assignment;
  }

  private async assertActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status !== 'ACTIVE') throw new ForbiddenException(ACADEMIC_MSG.forbidden);
  }

  /**
   * Bitácora `submissions.version.created` dentro de la transacción (D-047; con tx lanza): solo ids, número, hora y
   * puntualidad (nunca el nombre del alumno ni originalName). Sin `tx` nunca lanza; con `tx` relanza (D-047).
   */
  private async recordVersion(
    actor: Actor,
    assignmentId: string,
    enrollmentId: string,
    version: VersionRow,
    tx?: AuditTx,
  ): Promise<void> {
    const action = 'submissions.version.created';
    try {
      const event: AuditEvent = {
        actorId: actor.id,
        ip: actor.ip,
        module: 'submissions',
        action,
        entityType: 'Submission',
        entityId: version.submissionId,
        afterState: {
          assignmentId,
          enrollmentId,
          versionId: version.id,
          versionNumber: version.versionNumber,
          fileId: version.file.id,
          receivedAt: version.receivedAt.toISOString(),
          isLate: version.isLate,
        },
      };
      // Sin tx se llama con un solo argumento (firma de siempre).
      await (tx ? this.audit.record(event, tx) : this.audit.record(event));
    } catch (error: unknown) {
      if (tx) throw error;
      logger.error(
        `Fallo al registrar la bitácora: ${JSON.stringify({
          action,
          entityId: version.submissionId,
          actorId: actor.id,
          error: error instanceof Error ? error.name : typeof error,
        })}`,
      );
    }
  }
}
