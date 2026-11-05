import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserStatus } from '../../generated/prisma/enums.js';
import { AcademicEventPublisher } from '../academic/academic-events.js';
import { MSG, mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { INSTITUTION_EMAIL_DOMAIN } from './institution-domain.js';
import {
  CredentialIssuerService,
  type IssuedCredentials,
} from '../auth/credential-issuer.service.js';
import {
  enrollmentInclude,
  linkInclude,
  toEnrollmentView,
  toGuardianLinkView,
  toUserView,
  type EnrollmentView,
  type GuardianLinkView,
  type UserView,
} from './user-views.js';
import { recordUsers } from './users-audit.js';
import { lockUserForUpdate } from './users-locks.js';
import { assertEmailDomain, closeInstant } from './users-policy.js';
import { assertEmailFree, resolveTargetSection } from './users-queries.js';
import type {
  CreateStudentDto,
  EnrollDto,
  ListEnrollmentsQuery,
  TransferDto,
} from './users.dto.js';
import { USERS_MSG } from './users.errors.js';

export type TransferResult = { closed: EnrollmentView; current: EnrollmentView };

// Respuesta del alta (RF-18). Las contrasenas iniciales solo viajan aqui, una vez (RF-70).
export type CreatedStudent = {
  user: UserView;
  credentials: IssuedCredentials;
  enrollment: EnrollmentView;
  guardians: Array<{
    user: UserView;
    link: GuardianLinkView;
    // Verdadero si el apoderado se creo ahora; falso si ya existia y solo se vinculo (RF-86).
    created: boolean;
    credentials?: IssuedCredentials;
  }>;
};

type CreatedGuardian = {
  user: Awaited<ReturnType<PrismaService['user']['findUniqueOrThrow']>>;
  link: Awaited<ReturnType<PrismaService['guardianStudent']['findUniqueOrThrow']>> & {
    guardian: { id: string; fullName: string; status: UserStatus };
    student: { id: string; fullName: string; status: UserStatus };
  };
  created: boolean;
  credentials?: IssuedCredentials;
};

/** Estudiante bloqueado FOR UPDATE: 404 si no existe, 422 si no es STUDENT o está WITHDRAWN. */
async function lockEnrollableStudent(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const student = await lockUserForUpdate(tx, id);
  if (!student) throw new NotFoundException(USERS_MSG.studentNotFound);
  if (student.role !== 'STUDENT') throw new UnprocessableEntityException(USERS_MSG.notStudent);
  if (student.status === 'WITHDRAWN') {
    throw new UnprocessableEntityException(USERS_MSG.studentWithdrawn);
  }
}

// RF-18 (alta con matrícula), matrícula, RF-24 (traslado) e historial. Fechas solo del servidor.
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: AcademicEventPublisher,
    private readonly issuer: CredentialIssuerService,
    @Inject(INSTITUTION_EMAIL_DOMAIN) private readonly domain: string | null,
  ) {}

  // RF-18: alumno con su codigo, su contrasena inicial, su matricula vigente y de 1 a 2 apoderados
  // (RF-86), todo en una sola transaccion. Los apoderados se buscan por DNI: si ya existe uno
  // (el de un hermano), se reutiliza; si no, se crea con sus propias credenciales.
  async createStudent(dto: CreateStudentDto, actor: Actor): Promise<CreatedStudent> {
    if (dto.institutionalEmail) {
      assertEmailDomain(dto.institutionalEmail, 'STUDENT', this.domain);
      await assertEmailFree(this.prisma, dto.institutionalEmail);
    }
    const now = new Date();

    const result = await this.prisma
      .$transaction(async (tx) => {
        const section = await resolveTargetSection(tx, dto.sectionId);
        const { user, credentials } = await this.issuer.createUser(tx, {
          fullName: dto.fullName,
          role: 'STUDENT',
          dni: dto.dni,
          dniVerified: dto.dniVerified,
          institutionalEmail: dto.institutionalEmail,
        });
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: user.id,
            sectionId: section.id,
            academicYearId: section.academicYearId,
            effectiveFrom: now,
          },
          include: enrollmentInclude,
        });

        const guardians: CreatedGuardian[] = [];
        for (const [index, ref] of dto.guardians.entries()) {
          const existing = await this.issuer.findByDni(tx, ref.dni);
          let guardian: CreatedGuardian['user'];
          let issued: CreatedGuardian['credentials'];
          if (existing) {
            if (existing.role !== 'GUARDIAN') {
              throw new UnprocessableEntityException(USERS_MSG.guardianNotGuardian);
            }
            if (existing.status === 'WITHDRAWN') {
              throw new UnprocessableEntityException(USERS_MSG.guardianWithdrawn);
            }
            await lockUserForUpdate(tx, existing.id);
            guardian = existing;
          } else {
            if (!ref.fullName) throw new UnprocessableEntityException(USERS_MSG.guardianRequired);
            const created = await this.issuer.createUser(tx, {
              fullName: ref.fullName,
              role: 'GUARDIAN',
              dni: ref.dni,
              dniVerified: ref.dniVerified,
            });
            guardian = created.user;
            issued = created.credentials;
          }
          const link = await tx.guardianStudent.create({
            data: {
              guardianId: guardian.id,
              studentId: user.id,
              isPrimary: index === 0 ? true : null,
            },
            include: linkInclude,
          });
          guardians.push({
            user: guardian,
            link,
            created: issued !== undefined,
            credentials: issued,
          });
        }
        return { user, credentials, enrollment, guardians };
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.duplicate));

    // La bitacora lleva solo ids, roles y estados: nunca DNI, codigos ni contrasenas.
    await recordUsers(this.audit, actor, 'user.create', 'User', result.user.id, {
      after: { role: result.user.role, status: result.user.status },
    });
    await recordUsers(this.audit, actor, 'enrollment.create', 'Enrollment', result.enrollment.id, {
      after: {
        studentId: result.user.id,
        sectionId: result.enrollment.sectionId,
        academicYearId: result.enrollment.academicYearId,
      },
    });
    for (const g of result.guardians) {
      if (g.created) {
        await recordUsers(this.audit, actor, 'user.create', 'User', g.user.id, {
          after: { role: g.user.role, status: g.user.status },
        });
      }
      await recordUsers(this.audit, actor, 'guardian_link.create', 'GuardianStudent', g.link.id, {
        after: {
          guardianId: g.user.id,
          studentId: result.user.id,
          isActive: true,
          isPrimary: g.link.isPrimary === true,
        },
      });
    }
    return {
      user: toUserView(result.user),
      credentials: result.credentials,
      enrollment: toEnrollmentView(result.enrollment),
      guardians: result.guardians.map((g) => ({
        user: toUserView(g.user),
        link: toGuardianLinkView(g.link),
        created: g.created,
        ...(g.credentials ? { credentials: g.credentials } : {}),
      })),
    };
  }

  // Matrícula de un estudiante existente (también la rematrícula tras un retiro).
  async enroll(studentId: string, dto: EnrollDto, actor: Actor): Promise<EnrollmentView> {
    const now = new Date();
    const enrollment = await this.prisma
      .$transaction(async (tx) => {
        await lockEnrollableStudent(tx, studentId);
        const section = await resolveTargetSection(tx, dto.sectionId);
        const existing = await tx.enrollment.findFirst({
          where: { studentId, academicYearId: section.academicYearId, isCurrent: true },
          select: { id: true },
        });
        if (existing) throw new ConflictException(USERS_MSG.alreadyEnrolled);
        return tx.enrollment.create({
          data: {
            studentId,
            sectionId: section.id,
            academicYearId: section.academicYearId,
            effectiveFrom: now,
          },
          include: enrollmentInclude,
        });
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.alreadyEnrolled));

    await recordUsers(this.audit, actor, 'enrollment.create', 'Enrollment', enrollment.id, {
      after: {
        studentId,
        sectionId: enrollment.sectionId,
        academicYearId: enrollment.academicYearId,
      },
    });
    return toEnrollmentView(enrollment);
  }

  /**
   * RF-24: cierra la vigente (isCurrent NULL + effectiveTo + TRANSFER) y crea otra en la sección
   * destino, en una transacción. Mismo año y grado, sección distinta. at = max(now, effectiveFrom).
   */
  async transfer(studentId: string, dto: TransferDto, actor: Actor): Promise<TransferResult> {
    const now = new Date();
    const result = await this.prisma
      .$transaction(async (tx) => {
        await lockEnrollableStudent(tx, studentId);
        const section = await resolveTargetSection(tx, dto.sectionId);
        const current = await tx.enrollment.findFirst({
          where: { studentId, academicYearId: section.academicYearId, isCurrent: true },
          select: {
            id: true,
            sectionId: true,
            effectiveFrom: true,
            section: { select: { gradeLevel: true } },
          },
        });
        if (!current) throw new ConflictException(USERS_MSG.noCurrentEnrollment);
        if (current.sectionId === section.id) {
          throw new UnprocessableEntityException(USERS_MSG.sameSection);
        }
        if (current.section.gradeLevel !== section.gradeLevel) {
          throw new UnprocessableEntityException(USERS_MSG.otherGrade);
        }
        const at = closeInstant(now, current.effectiveFrom);
        const { count } = await tx.enrollment.updateMany({
          where: { id: current.id, isCurrent: true },
          data: { isCurrent: null, effectiveTo: at, endReason: 'TRANSFER' },
        });
        if (count === 0) throw new ConflictException(MSG.conflict);
        const created = await tx.enrollment.create({
          data: {
            studentId,
            sectionId: section.id,
            academicYearId: section.academicYearId,
            effectiveFrom: at,
          },
          include: enrollmentInclude,
        });
        const closed = await tx.enrollment.findUniqueOrThrow({
          where: { id: current.id },
          include: enrollmentInclude,
        });
        return { closed, created, at };
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.conflict));

    const { closed, created, at } = result;
    await recordUsers(this.audit, actor, 'enrollment.transfer', 'Enrollment', created.id, {
      before: { enrollmentId: closed.id, sectionId: closed.sectionId },
      after: {
        enrollmentId: created.id,
        sectionId: created.sectionId,
        endReason: 'TRANSFER',
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
      },
    });
    this.events.publish({
      type: 'enrollment.transferred.v1',
      payload: {
        studentId,
        academicYearId: created.academicYearId,
        fromEnrollmentId: closed.id,
        toEnrollmentId: created.id,
        fromSectionId: closed.sectionId,
        toSectionId: created.sectionId,
        transferredAt: at.toISOString(),
      },
    });
    return { closed: toEnrollmentView(closed), current: toEnrollmentView(created) };
  }

  // Historial de matrículas (vigente y cerradas), opcionalmente de un año.
  async listForStudent(
    studentId: string,
    query: ListEnrollmentsQuery,
  ): Promise<{ items: EnrollmentView[]; total: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException(USERS_MSG.studentNotFound);
    if (user.role !== 'STUDENT') throw new UnprocessableEntityException(USERS_MSG.notStudent);
    const rows = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        ...(query.academicYearId !== undefined ? { academicYearId: query.academicYearId } : {}),
      },
      include: enrollmentInclude,
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const items = rows.map(toEnrollmentView);
    return { items, total: items.length };
  }
}
