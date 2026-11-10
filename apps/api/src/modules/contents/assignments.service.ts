import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { GradeLiteralCode } from '@aula/shared';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicAccessService, periodIsOpen } from '../academic/academic-access.service.js';
import { mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import type {
  CreateAssignmentDto,
  ListAssignmentsQuery,
  UpdateAssignmentDto,
} from './assignments.dto.js';
import {
  auditSnapshot,
  checkNoSubmissionLiteral,
  diffAssignment,
  isDueAtAcceptable,
  type AssignmentFields,
} from './assignments.policy.js';
import { recordContents } from './contents-audit.js';
import { assertCanWriteCourseSection, lockOpenPeriod, PERIOD_CLOSED } from './contents-guards.js';
import { ContentsEventPublisher } from './contents-events.js';

// Contrato HTTP de una tarea (docs/03, "Ejemplo de Assignment") más el estado del período.
export type AssignmentView = {
  id: string;
  courseSectionId: string;
  periodId: string;
  title: string;
  instructions: string;
  dueAt: string;
  maxSizeBytes: number;
  noSubmissionGrade: string;
  /** NE en escala literal (INICIAL/PRIMARIA); null en SECUNDARIA o sin definir. */
  noSubmissionLiteral: GradeLiteralCode | null;
  allowLate: boolean;
  attachmentFileId: string | null;
  /** RN-10: false si el período o su año están cerrados (la tarea ya no se edita). */
  periodIsOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MSG = {
  notFound: 'La tarea no existe',
  periodClosed: PERIOD_CLOSED,
  dueAtPast: 'El plazo de entrega debe ser posterior a la fecha actual',
  invalidAttachment: 'El archivo adjunto no es válido para esta tarea',
  attachmentInUse: 'El archivo adjunto ya está en uso',
  hasSubmissions: 'La tarea ya tiene entregas y no se puede eliminar',
  hasGrades: 'La tarea ya tiene notas y no se puede eliminar',
} as const;

const assignmentInclude = {
  period: { select: { closedAt: true, academicYear: true } },
} as const;

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

function toView(a: AssignmentRow): AssignmentView {
  return {
    id: a.id,
    courseSectionId: a.courseSectionId,
    periodId: a.periodId,
    title: a.title,
    instructions: a.instructions,
    dueAt: a.dueAt.toISOString(),
    maxSizeBytes: a.maxSizeBytes,
    noSubmissionGrade: a.noSubmissionGrade.toFixed(2),
    noSubmissionLiteral: a.noSubmissionLiteral,
    allowLate: a.allowLate,
    attachmentFileId: a.attachmentFileId,
    periodIsOpen: periodIsOpen(a.period, a.period.academicYear),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

const fieldsOf = (a: AssignmentRow): AssignmentFields => ({
  title: a.title,
  instructions: a.instructions,
  dueAt: a.dueAt,
  maxSizeBytes: a.maxSizeBytes,
  noSubmissionGrade: a.noSubmissionGrade.toFixed(2),
  noSubmissionLiteral: a.noSubmissionLiteral,
  allowLate: a.allowLate,
  attachmentFileId: a.attachmentFileId,
});

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly events: ContentsEventPublisher,
  ) {}

  // RF-28: crear tarea (docente asignado o ADMIN; período abierto del mismo año, RN-10).
  async create(
    courseSectionId: string,
    dto: CreateAssignmentDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<AssignmentView> {
    await assertCanWriteCourseSection(this.access, user, courseSectionId);
    await this.access.assertCourseSectionWritable(courseSectionId, dto.periodId);
    await this.assertNoSubmissionLiteral(courseSectionId, dto.noSubmissionLiteral);
    if (!isDueAtAcceptable(dto.dueAt, new Date())) {
      throw new UnprocessableEntityException(MSG.dueAtPast);
    }

    const created = await this.prisma
      .$transaction(async (tx) => {
        await lockOpenPeriod(tx, dto.periodId);
        if (dto.attachmentFileId !== null) {
          await this.assertAttachmentUsable(tx, dto.attachmentFileId, courseSectionId, null);
        }
        const row = await tx.assignment.create({
          data: {
            courseSectionId,
            periodId: dto.periodId,
            title: dto.title,
            instructions: dto.instructions,
            dueAt: dto.dueAt,
            maxSizeBytes: dto.maxSizeBytes,
            noSubmissionGrade: dto.noSubmissionGrade,
            noSubmissionLiteral: dto.noSubmissionLiteral,
            allowLate: dto.allowLate,
            attachmentFileId: dto.attachmentFileId,
            createdById: actor.id,
          },
          include: assignmentInclude,
        });
        const rowFields = fieldsOf(row);
        await recordContents(
          this.audit,
          actor,
          'assignment.created',
          'Assignment',
          row.id,
          { after: auditSnapshot({ ...rowFields, courseSectionId, periodId: row.periodId }) },
          tx,
        );
        return row;
      })
      .catch((e: unknown) => this.mapError(e));

    this.events.publish({
      type: 'assignment.created.v1',
      payload: {
        assignmentId: created.id,
        courseSectionId,
        periodId: created.periodId,
        dueAt: created.dueAt.toISOString(),
        allowLate: created.allowLate,
        createdAt: created.createdAt.toISOString(),
      },
    });
    return toView(created);
  }

  /** 400 si se envía un literal de NE en una sección de SECUNDARIA (tres niveles). */
  private async assertNoSubmissionLiteral(
    courseSectionId: string,
    literal: GradeLiteralCode | null | undefined,
  ): Promise<void> {
    if (literal === null || literal === undefined) return;
    const cs = await this.prisma.courseSection.findUnique({
      where: { id: courseSectionId },
      select: { section: { select: { level: true } } },
    });
    const message = cs ? checkNoSubmissionLiteral(cs.section.level, literal) : null;
    if (message) {
      throw new BadRequestException({ message: [{ path: 'noSubmissionLiteral', message }] });
    }
  }

  // RF-28: lista de tareas del curso-sección para sus miembros (sin apoderado; lo filtra @Roles).
  async list(
    courseSectionId: string,
    query: ListAssignmentsQuery,
    user: AuthenticatedUser,
  ): Promise<{ items: AssignmentView[]; total: number }> {
    await this.access.assertCanAccessCourseSection(user, courseSectionId);
    const rows = await this.prisma.assignment.findMany({
      where: { courseSectionId, deletedAt: null, periodId: query.periodId },
      include: assignmentInclude,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toView), total: rows.length };
  }

  async get(id: string, user: AuthenticatedUser): Promise<AssignmentView> {
    const assignment = await this.findOrFail(id);
    await this.access.assertCanAccessCourseSection(user, assignment.courseSectionId);
    return toView(assignment);
  }

  // RF-29: editar solo con el período abierto (RN-10). El período no cambia.
  async update(
    id: string,
    dto: UpdateAssignmentDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<AssignmentView> {
    const current = await this.findOrFail(id);
    await assertCanWriteCourseSection(this.access, user, current.courseSectionId);
    await this.access.assertCourseSectionWritable(current.courseSectionId, current.periodId);
    await this.assertNoSubmissionLiteral(current.courseSectionId, dto.noSubmissionLiteral);

    const change = diffAssignment(fieldsOf(current), dto);
    if (change.changedFields.length === 0) return toView(current);
    if (dto.dueAt !== undefined && change.changedFields.includes('dueAt')) {
      if (!isDueAtAcceptable(dto.dueAt, new Date())) {
        throw new UnprocessableEntityException(MSG.dueAtPast);
      }
    }

    const updated = await this.prisma
      .$transaction(async (tx) => {
        await lockOpenPeriod(tx, current.periodId);
        if (change.changedFields.includes('attachmentFileId') && dto.attachmentFileId) {
          await this.assertAttachmentUsable(tx, dto.attachmentFileId, current.courseSectionId, id);
        }
        const { count } = await tx.assignment.updateMany({
          where: { id, deletedAt: null },
          data: {
            title: dto.title,
            instructions: dto.instructions,
            dueAt: dto.dueAt,
            maxSizeBytes: dto.maxSizeBytes,
            noSubmissionGrade: dto.noSubmissionGrade,
            noSubmissionLiteral: dto.noSubmissionLiteral,
            allowLate: dto.allowLate,
            attachmentFileId: dto.attachmentFileId,
          },
        });
        if (count === 0) throw new NotFoundException(MSG.notFound);
        const row = await tx.assignment.findUniqueOrThrow({
          where: { id },
          include: assignmentInclude,
        });
        await recordContents(
          this.audit,
          actor,
          'assignment.updated',
          'Assignment',
          id,
          {
            before: change.before,
            after: { ...change.after, changedFields: change.changedFields },
          },
          tx,
        );
        return row;
      })
      .catch((e: unknown) => this.mapError(e));

    this.events.publish({
      type: 'assignment.updated.v1',
      payload: {
        assignmentId: id,
        courseSectionId: updated.courseSectionId,
        periodId: updated.periodId,
        dueAt: updated.dueAt.toISOString(),
        allowLate: updated.allowLate,
        changedFields: change.changedFields,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
    return toView(updated);
  }

  // Borrado lógico (RN-14: no se pierde historial). 409 si ya hay alguna versión entregada o nota.
  async remove(id: string, user: AuthenticatedUser, actor: Actor): Promise<void> {
    const current = await this.findOrFail(id);
    await assertCanWriteCourseSection(this.access, user, current.courseSectionId);
    await this.access.assertCourseSectionWritable(current.courseSectionId, current.periodId);

    const deletedAt = new Date();
    await this.prisma
      .$transaction(async (tx) => {
        await lockOpenPeriod(tx, current.periodId);
        // La fila de la tarea bloqueada: una entrega concurrente (3d) que la bloquee espera.
        const rows = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
          SELECT deletedAt FROM Assignment WHERE id = ${id} FOR UPDATE`;
        if (rows.length === 0 || rows[0].deletedAt !== null) {
          throw new NotFoundException(MSG.notFound);
        }
        const versions = await tx.submissionVersion.count({
          where: { submission: { assignmentId: id } },
        });
        if (versions > 0) throw new ConflictException(MSG.hasSubmissions);
        // RN-10: tampoco si ya tiene notas (p. ej. una NE registrada sin entrega).
        const grades = await tx.grade.count({ where: { assignmentId: id } });
        if (grades > 0) throw new ConflictException(MSG.hasGrades);
        await tx.assignment.update({ where: { id }, data: { deletedAt } });
        await recordContents(
          this.audit,
          actor,
          'assignment.deleted',
          'Assignment',
          id,
          { before: { deletedAt: null }, after: { deletedAt: deletedAt.toISOString() } },
          tx,
        );
      })
      .catch((e: unknown) => this.mapError(e));
  }

  /**
   * El adjunto debe ser un StoredFile limpio con purpose ASSIGNMENT_ATTACHMENT, del mismo
   * curso-sección, sin purgar y sin otra tarea. La fila se bloquea para que dos tareas no lo
   * tomen a la vez (además está el índice único de attachmentFileId). 422 con un solo mensaje
   * para no revelar si el archivo existe en otro curso.
   */
  private async assertAttachmentUsable(
    tx: Prisma.TransactionClient,
    fileId: string,
    courseSectionId: string,
    assignmentId: string | null,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM StoredFile WHERE id = ${fileId} FOR UPDATE`;
    if (locked.length === 0) throw new UnprocessableEntityException(MSG.invalidAttachment);
    const file = await tx.storedFile.findUnique({
      where: { id: fileId },
      select: {
        purpose: true,
        courseSectionId: true,
        scanStatus: true,
        purgedAt: true,
        attachedToAssignment: { select: { id: true } },
      },
    });
    const usable =
      file !== null &&
      file.purpose === 'ASSIGNMENT_ATTACHMENT' &&
      file.courseSectionId === courseSectionId &&
      file.scanStatus === 'CLEAN' &&
      file.purgedAt === null;
    if (!usable) throw new UnprocessableEntityException(MSG.invalidAttachment);
    const owner = file.attachedToAssignment?.id ?? null;
    if (owner !== null && owner !== assignmentId) {
      throw new ConflictException(MSG.attachmentInUse);
    }
  }

  private async findOrFail(id: string): Promise<AssignmentRow> {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, deletedAt: null },
      include: assignmentInclude,
    });
    if (!assignment) throw new NotFoundException(MSG.notFound);
    return assignment;
  }

  // P2002 (attachmentFileId único) y bloqueos mutuos → 409; las HttpException pasan tal cual.
  private mapError(error: unknown): never {
    return mapPrismaError(error, MSG.attachmentInUse);
  }
}
