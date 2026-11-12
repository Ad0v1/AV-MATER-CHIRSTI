import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SessionService } from '../../common/session/session.service.js';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { AcademicEventPublisher } from '../academic/academic-events.js';
import { MSG, mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import {
  CredentialIssuerService,
  type IssuedCredentials,
} from '../auth/credential-issuer.service.js';
import { LoginAttemptsService } from '../auth/login-attempts.service.js';
import {
  enrollmentInclude,
  linkInclude,
  sectionRef,
  toEnrollmentView,
  toGuardianLinkView,
  toUserView,
  type CredentialStatus,
  type EnrollmentView,
  type GuardianLinkView,
  type SectionRef,
  type UserListItem,
  type UserView,
} from './user-views.js';
import { recordUsers } from './users-audit.js';
import {
  lockActiveAdminIds,
  lockUserForUpdate,
  lockYearForShare,
  readUserRole,
} from './users-locks.js';
import { assertStatusChangeAllowed, buildUserSearchWhere, closeInstant } from './users-policy.js';
import { assertEmailFree, isStudentWithoutAccount } from './users-queries.js';
import type {
  ChangeStatusDto,
  CorrectDniDto,
  CreateTeacherDto,
  ListUsersQuery,
  UpdateUserDto,
} from './users.dto.js';
import { STUDENT_WITHOUT_ACCOUNT, USERS_MSG } from './users.errors.js';

export type UserListPage = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserDetail = UserView & {
  // RF-87: estado de las credenciales y bloqueo por intentos fallidos.
  credentialStatus: CredentialStatus;
  locked: boolean;
  currentEnrollment?: EnrollmentView | null;
  guardians?: GuardianLinkView[];
  students?: GuardianLinkView[];
};

export type StatusChangeResult = { user: UserView; closedEnrollments: EnrollmentView[] };

type ClosedEnrollment = { id: string; effectiveTo: Date };
type StatusTxResult =
  | { changed: false }
  | { changed: true; role: UserRole; previous: UserStatus; closed: ClosedEnrollment[] };

/**
 * Máximo de ids que devuelve la búsqueda por texto (`q`). Con un colegio (cientos o pocos miles de
 * usuarios) no se alcanza; existe para que un `q` muy común no arme un `IN` sin límite.
 */
export const SEARCH_IDS_LIMIT = 5000;

const listSelect = {
  id: true,
  code: true,
  email: true,
  contactEmail: true,
  emailVerifiedAt: true,
  dniVerifiedAt: true,
  fullName: true,
  role: true,
  status: true,
  localCredential: { select: { mustChangePassword: true } },
} as const;

export type CreatedTeacher = { user: UserView; credentials: IssuedCredentials };
export type ReissuedCredentials = { user: UserView; credentials: IssuedCredentials };

function credentialStatus(credential: { mustChangePassword: boolean } | null): CredentialStatus {
  if (!credential) return 'NONE';
  return credential.mustChangePassword ? 'PENDING' : 'READY';
}

// RF-19, RF-22, RF-23, RF-25 (Decisión 3). Solo ADMIN (lo exige el controlador).
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly events: AcademicEventPublisher,
    private readonly issuer: CredentialIssuerService,
    private readonly sessions: SessionService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  // RF-25: búsqueda paginada por nombre o correo, rol, estado, grado y sección (año activo por defecto).
  async list(query: ListUsersQuery): Promise<UserListPage> {
    const academicYearId = query.academicYearId ?? (await this.access.getActiveYear())?.id ?? null;
    const matchingIds = query.q === undefined ? undefined : await this.searchIds(query.q);
    const where = buildUserSearchWhere(query, academicYearId, matchingIds);
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: listSelect,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const sections = await this.currentSections(
      rows.filter((r) => r.role === 'STUDENT').map((r) => r.id),
      academicYearId,
    );
    const items = await Promise.all(
      rows.map(async (r): Promise<UserListItem> => ({
        id: r.id,
        code: r.code,
        email: r.email,
        contactEmail: r.contactEmail,
        emailVerified: r.emailVerifiedAt !== null,
        dniVerified: r.dniVerifiedAt !== null,
        fullName: r.fullName,
        role: r.role,
        status: r.status,
        currentSection: sections.get(r.id) ?? null,
        credentialStatus: credentialStatus(r.localCredential),
        locked: r.code ? await this.attempts.isLocked(r.code) : false,
      })),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { localCredential: { select: { mustChangePassword: true } } },
    });
    if (!user) throw new NotFoundException(USERS_MSG.userNotFound);
    const view: UserDetail = {
      ...toUserView(user),
      credentialStatus: credentialStatus(user.localCredential),
      locked: user.code ? await this.attempts.isLocked(user.code) : false,
    };
    if (user.role === 'STUDENT') {
      const active = await this.access.getActiveYear();
      const current = active
        ? await this.prisma.enrollment.findFirst({
            where: { studentId: id, academicYearId: active.id, isCurrent: true },
            include: enrollmentInclude,
          })
        : null;
      view.currentEnrollment = current ? toEnrollmentView(current) : null;
      const links = await this.prisma.guardianStudent.findMany({
        where: { studentId: id, isActive: true },
        include: linkInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      view.guardians = links.map(toGuardianLinkView);
    }
    if (user.role === 'GUARDIAN') {
      const links = await this.prisma.guardianStudent.findMany({
        where: { guardianId: id, isActive: true },
        include: linkInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      view.students = links.map(toGuardianLinkView);
    }
    return view;
  }

  // RF-22: nombre y correo. El rol no cambia (D-012). Sin cambios → 200 sin bitácora.
  async update(id: string, dto: UpdateUserDto, actor: Actor): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(USERS_MSG.userNotFound);
    const data: { fullName?: string; email?: string } = {};
    if (dto.fullName !== undefined && dto.fullName !== user.fullName) data.fullName = dto.fullName;
    if (dto.email !== undefined && dto.email !== user.email) {
      await assertEmailFree(this.prisma, dto.email, id);
      data.email = dto.email;
    }
    const changedFields = Object.keys(data);
    if (changedFields.length === 0) return toUserView(user);

    const updated = await this.prisma.user
      .update({ where: { id }, data })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.emailTaken));
    // Solo los nombres de los campos: nunca el nombre ni el correo (D-024).
    await recordUsers(this.audit, actor, 'user.update', 'User', id, {
      after: { changedFields },
    });
    return toUserView(updated);
  }

  /**
   * RF-23: cambia el estado. STUDENT → WITHDRAWN cierra en la misma transacción sus matrículas
   * vigentes de años no cerrados (isCurrent NULL + effectiveTo + WITHDRAWAL). INACTIVE no toca la
   * matrícula; volver a ACTIVE no la reabre. Bloqueos: (si es ADMIN) ADMIN activos FOR UPDATE →
   * User FOR UPDATE → AcademicYear FOR SHARE. Un deadlock (P2034, o 1213 como P2010) → 409.
   */
  async changeStatus(id: string, dto: ChangeStatusDto, actor: Actor): Promise<StatusChangeResult> {
    if (id === actor.id) throw new ConflictException(USERS_MSG.ownStatus);
    const now = new Date();

    const result = await this.prisma
      .$transaction(async (tx): Promise<StatusTxResult> => {
        // Orden global (users-locks.ts): si el objetivo es ADMIN, primero la lista de ADMIN
        // activos y después el objetivo; así dos cambios de ADMIN no se esperan en cruz.
        const role = await readUserRole(tx, id);
        if (!role) throw new NotFoundException(USERS_MSG.userNotFound);
        const activeAdmins = role === 'ADMIN' ? await lockActiveAdminIds(tx) : [];
        const target = await lockUserForUpdate(tx, id);
        if (!target) throw new NotFoundException(USERS_MSG.userNotFound);
        if (target.status === dto.status) return { changed: false };

        const otherActiveAdmins = activeAdmins.filter((a) => a !== id).length;
        assertStatusChangeAllowed({
          actorId: actor.id,
          target,
          status: dto.status,
          otherActiveAdmins,
        });

        const closed: ClosedEnrollment[] = [];
        if (target.role === 'STUDENT' && dto.status === 'WITHDRAWN') {
          const current = await tx.enrollment.findMany({
            where: { studentId: id, isCurrent: true },
            select: { id: true, academicYearId: true, effectiveFrom: true },
            orderBy: { academicYearId: 'asc' },
          });
          for (const enrollment of current) {
            const year = await lockYearForShare(tx, enrollment.academicYearId);
            if (!year?.isOpen) continue; // los años cerrados son de solo lectura
            const effectiveTo = closeInstant(now, enrollment.effectiveFrom);
            const { count } = await tx.enrollment.updateMany({
              where: { id: enrollment.id, isCurrent: true },
              data: { isCurrent: null, effectiveTo, endReason: 'WITHDRAWAL' },
            });
            if (count === 0) throw new ConflictException(MSG.conflict);
            closed.push({ id: enrollment.id, effectiveTo });
          }
        }
        await tx.user.update({ where: { id }, data: { status: dto.status } });
        return { changed: true, role: target.role, previous: target.status, closed };
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.conflict));

    const user = toUserView(await this.prisma.user.findUniqueOrThrow({ where: { id } }));
    if (!result.changed) return { user, closedEnrollments: [] };

    // RF-78: una baja cierra las sesiones abiertas del usuario (RF-08).
    if (dto.status !== 'ACTIVE') await this.sessions.revokeAll(id);
    await recordUsers(this.audit, actor, 'user.status_change', 'User', id, {
      before: { status: result.previous },
      after: { status: dto.status, ...(dto.reason !== undefined ? { reason: dto.reason } : {}) },
    });
    for (const closed of result.closed) {
      await recordUsers(this.audit, actor, 'enrollment.withdraw', 'Enrollment', closed.id, {
        before: { isCurrent: true },
        after: {
          isCurrent: false,
          effectiveTo: closed.effectiveTo.toISOString(),
          endReason: 'WITHDRAWAL',
        },
      });
    }
    this.events.publish({
      type: 'user.status-changed.v1',
      payload: {
        userId: id,
        role: result.role,
        previousStatus: result.previous,
        status: dto.status,
        changedAt: now.toISOString(),
        closedEnrollmentIds: result.closed.map((c) => c.id),
      },
    });

    const closedRows = result.closed.length
      ? await this.prisma.enrollment.findMany({
          where: { id: { in: result.closed.map((c) => c.id) } },
          include: enrollmentInclude,
          orderBy: { effectiveFrom: 'asc' },
        })
      : [];
    return { user, closedEnrollments: closedRows.map(toEnrollmentView) };
  }

  // RF-19: alta de docente, con su codigo y su contrasena inicial (RF-68, RF-70).
  async createTeacher(dto: CreateTeacherDto, actor: Actor): Promise<CreatedTeacher> {
    if (dto.email) {
      await assertEmailFree(this.prisma, dto.email);
    }
    const { user, credentials } = await this.prisma
      .$transaction((tx) =>
        this.issuer.createUser(tx, {
          fullName: dto.fullName,
          role: 'TEACHER',
          dni: dto.dni,
          dniVerified: dto.dniVerified,
          email: dto.email,
        }),
      )
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.duplicate));
    await recordUsers(this.audit, actor, 'user.create', 'User', user.id, {
      after: { role: user.role, status: user.status },
    });
    return { user: toUserView(user), credentials };
  }

  /**
   * RF-74: contrasena temporal nueva. Cierra las sesiones del usuario, levanta el bloqueo y lo
   * obliga a cambiarla en su siguiente ingreso. Si el usuario es anterior al login por codigo y no
   * tiene codigo o credencial, se le asignan. La contrasena solo viaja en esta respuesta.
   */
  /** Tres niveles: 422 STUDENT_WITHOUT_ACCOUNT si el usuario es un niño de INICIAL sin login. */
  private async assertHasAccount(tx: Parameters<typeof isStudentWithoutAccount>[0], id: string) {
    if (await isStudentWithoutAccount(tx, id)) {
      throw new UnprocessableEntityException({
        code: STUDENT_WITHOUT_ACCOUNT,
        message: USERS_MSG.studentWithoutAccount,
      });
    }
  }

  async resetPassword(id: string, actor: Actor): Promise<ReissuedCredentials> {
    const { user, credentials } = await this.prisma
      .$transaction(async (tx) => {
        const target = await lockUserForUpdate(tx, id);
        if (!target) throw new NotFoundException(USERS_MSG.userNotFound);
        await this.assertHasAccount(tx, id);
        const issued = await this.issuer.reissue(tx, id);
        return {
          user: await tx.user.findUniqueOrThrow({ where: { id } }),
          credentials: { code: issued.code, initialPassword: issued.initialPassword },
        };
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.duplicate));
    await this.sessions.revokeAll(id);
    if (user.code) await this.attempts.unlock(user.code);
    await recordUsers(this.audit, actor, 'user.reset_password', 'User', id);
    return { user: toUserView(user), credentials };
  }

  /**
   * RF-84: corrige el DNI. Genera un codigo nuevo (RN-16), emite una contrasena temporal, cierra las
   * sesiones y obliga a cambiarla. El codigo anterior queda en la bitacora, junto con el motivo.
   * El DNI nunca se registra.
   */
  async correctDni(id: string, dto: CorrectDniDto, actor: Actor): Promise<ReissuedCredentials> {
    const { user, credentials, previousCode } = await this.prisma
      .$transaction(async (tx) => {
        const target = await lockUserForUpdate(tx, id);
        if (!target) throw new NotFoundException(USERS_MSG.userNotFound);
        await this.assertHasAccount(tx, id);
        const current = await tx.user.findUniqueOrThrow({ where: { id } });
        if (current.dniHash === this.issuer.hashDni(dto.dni)) {
          throw new ConflictException(USERS_MSG.sameDni);
        }
        await this.issuer.assertDniFree(tx, dto.dni, id);
        const issued = await this.issuer.reissue(tx, id, { newCode: true });
        await tx.user.update({
          where: { id },
          data: { ...this.issuer.dniData(dto.dni), dniVerifiedAt: null },
        });
        return {
          user: await tx.user.findUniqueOrThrow({ where: { id } }),
          credentials: { code: issued.code, initialPassword: issued.initialPassword },
          previousCode: issued.previousCode,
        };
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.duplicate));
    await this.sessions.revokeAll(id);
    if (previousCode) await this.attempts.unlock(previousCode);
    await recordUsers(this.audit, actor, 'user.correct_dni', 'User', id, {
      before: { code: previousCode },
      after: { code: credentials.code, reason: dto.reason },
    });
    return { user: toUserView(user), credentials };
  }

  // RF-69: el administrador marca que comparo el DNI con el documento fisico.
  async verifyDni(id: string, actor: Actor): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(USERS_MSG.userNotFound);
    if (!user.dniHash) throw new ConflictException(USERS_MSG.noCredential);
    if (user.dniVerifiedAt) return toUserView(user);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { dniVerifiedAt: new Date() },
    });
    await recordUsers(this.audit, actor, 'user.verify_dni', 'User', id);
    return toUserView(updated);
  }

  /**
   * Ids de usuarios cuyo nombre o correo contiene `q` como texto literal. LOCATE no tiene
   * comodines (Prisma `contains` dejaría pasar % y _) y respeta la intercalación _ci.
   * Tope SEARCH_IDS_LIMIT: acota la lista de ids que luego va en el `IN` de Prisma; si una
   * búsqueda supera el tope, el total y las páginas se calculan sobre los primeros ids (por id).
   */
  private async searchIds(q: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM User
      WHERE LOCATE(${q}, fullName) > 0 OR LOCATE(${q}, email) > 0
         OR LOCATE(${q}, contactEmail) > 0 OR LOCATE(${q}, code) > 0
      ORDER BY id LIMIT ${SEARCH_IDS_LIMIT}`;
    return rows.map((r) => r.id);
  }

  /** Sección vigente de cada estudiante en el año (para la lista). */
  private async currentSections(
    studentIds: string[],
    academicYearId: string | null,
  ): Promise<Map<string, SectionRef>> {
    const map = new Map<string, SectionRef>();
    if (studentIds.length === 0 || academicYearId === null) return map;
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, academicYearId, isCurrent: true },
      select: {
        studentId: true,
        section: { select: { id: true, level: true, gradeLevel: true, code: true } },
      },
    });
    for (const r of rows) map.set(r.studentId, sectionRef(r.section));
    return map;
  }
}
