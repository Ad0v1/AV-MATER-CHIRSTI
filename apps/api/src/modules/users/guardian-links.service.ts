import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { mapPrismaError } from '../academic/academic.errors.js';
import {
  CredentialIssuerService,
  type IssuedCredentials,
} from '../auth/credential-issuer.service.js';
import type { Actor } from '../academic/request-user.js';
import {
  linkInclude,
  toGuardianLinkView,
  toUserView,
  type GuardianLinkView,
  type UserView,
} from './user-views.js';
import { recordUsers } from './users-audit.js';
import { lockUsersForUpdate, type LockedUser } from './users-locks.js';
import { closeInstant } from './users-policy.js';
import { assertEmailFree } from './users-queries.js';
import type {
  CreateGuardianDto,
  LinkStudentDto,
  ListLinksQuery,
  RevokeLinkDto,
} from './users.dto.js';
import { USERS_MSG } from './users.errors.js';

export type LinkList = { items: GuardianLinkView[]; total: number };

export type CreatedGuardianResult = {
  user: UserView;
  credentials: IssuedCredentials;
  links: GuardianLinkView[];
};

/** 422 si el usuario no es un STUDENT vinculable (no existe en el cuerpo, otro rol o WITHDRAWN). */
function assertLinkableStudent(student: LockedUser | undefined): void {
  if (!student) throw new UnprocessableEntityException(USERS_MSG.studentNotFound);
  if (student.role !== 'STUDENT') throw new UnprocessableEntityException(USERS_MSG.notStudent);
  if (student.status === 'WITHDRAWN') {
    throw new UnprocessableEntityException(USERS_MSG.studentWithdrawn);
  }
}

type Tx = Prisma.TransactionClient;

/** Apoderados vigentes del alumno (dentro de la transaccion, con el alumno bloqueado). */
const countActiveGuardians = (tx: Tx, studentId: string): Promise<number> =>
  tx.guardianStudent.count({ where: { studentId, isActive: true } });

/** RN-17: 409 si el alumno ya tiene 2 apoderados vigentes. Devuelve cuantos tiene ahora. */
async function assertRoomForGuardian(tx: Tx, studentId: string): Promise<number> {
  const active = await countActiveGuardians(tx, studentId);
  if (active >= 2) throw new ConflictException(USERS_MSG.maxGuardians);
  return active;
}

const orderBy = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.GuardianStudentOrderByWithRelationInput[];

// RF-20 (alta de apoderado), vínculos y revocación (RN-13). TRUE = vigente; NULL = revocado.
@Injectable()
export class GuardianLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly issuer: CredentialIssuerService,
  ) {}

  // RF-20: apoderado con su codigo y su contrasena inicial, vinculado a 1 o mas alumnos, en una
  // transaccion (alumnos bloqueados). Si ya existe un apoderado con ese DNI no se crea otro:
  // se vincula con POST /guardians/:id/students (RF-86).
  async createGuardian(dto: CreateGuardianDto, actor: Actor): Promise<CreatedGuardianResult> {
    if (dto.email) {
      await assertEmailFree(this.prisma, dto.email);
    }

    const { user, credentials, links } = await this.prisma
      .$transaction(async (tx) => {
        const students = await lockUsersForUpdate(tx, dto.studentIds);
        for (const id of dto.studentIds) assertLinkableStudent(students.get(id));
        for (const id of dto.studentIds) await assertRoomForGuardian(tx, id);
        const created = await this.issuer.createUser(tx, {
          fullName: dto.fullName,
          role: 'GUARDIAN',
          dni: dto.dni,
          dniVerified: dto.dniVerified,
          email: dto.email,
        });
        const createdLinks = [];
        for (const studentId of dto.studentIds) {
          createdLinks.push(
            await tx.guardianStudent.create({
              data: {
                guardianId: created.user.id,
                studentId,
                isPrimary: (await countActiveGuardians(tx, studentId)) === 0 ? true : null,
              },
              include: linkInclude,
            }),
          );
        }
        return { user: created.user, credentials: created.credentials, links: createdLinks };
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.duplicate));

    await recordUsers(this.audit, actor, 'user.create', 'User', user.id, {
      after: { role: user.role, status: user.status },
    });
    for (const link of links) {
      await recordUsers(this.audit, actor, 'guardian_link.create', 'GuardianStudent', link.id, {
        after: {
          guardianId: link.guardianId,
          studentId: link.studentId,
          isActive: true,
          isPrimary: link.isPrimary === true,
        },
      });
    }
    return { user: toUserView(user), credentials, links: links.map(toGuardianLinkView) };
  }

  async listForGuardian(guardianId: string, query: ListLinksQuery): Promise<LinkList> {
    await this.findWithRole(guardianId, 'GUARDIAN');
    return this.list({ guardianId }, query.includeRevoked);
  }

  async listForStudent(studentId: string, query: ListLinksQuery): Promise<LinkList> {
    await this.findWithRole(studentId, 'STUDENT');
    return this.list({ studentId }, query.includeRevoked);
  }

  // Vínculo nuevo; un solo vigente por par (UNIQUE con el marcador). Revocados se conservan.
  async link(guardianId: string, dto: LinkStudentDto, actor: Actor): Promise<GuardianLinkView> {
    if (guardianId === dto.studentId) throw new UnprocessableEntityException(USERS_MSG.sameUser);
    const link = await this.prisma
      .$transaction(async (tx) => {
        const users = await lockUsersForUpdate(tx, [guardianId, dto.studentId]);
        const guardian = users.get(guardianId);
        const student = users.get(dto.studentId);
        if (!guardian) throw new NotFoundException(USERS_MSG.guardianNotFound);
        if (!student) throw new NotFoundException(USERS_MSG.studentNotFound);
        if (guardian.role !== 'GUARDIAN') {
          throw new UnprocessableEntityException(USERS_MSG.notGuardian);
        }
        if (guardian.status === 'WITHDRAWN') {
          throw new UnprocessableEntityException(USERS_MSG.guardianWithdrawn);
        }
        assertLinkableStudent(student);
        const existing = await tx.guardianStudent.findFirst({
          where: { guardianId, studentId: dto.studentId, isActive: true },
          select: { id: true },
        });
        if (existing) throw new ConflictException(USERS_MSG.linkDuplicate);
        const active = await assertRoomForGuardian(tx, dto.studentId);
        return tx.guardianStudent.create({
          data: { guardianId, studentId: dto.studentId, isPrimary: active === 0 ? true : null },
          include: linkInclude,
        });
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.linkDuplicate));

    await recordUsers(this.audit, actor, 'guardian_link.create', 'GuardianStudent', link.id, {
      after: {
        guardianId,
        studentId: dto.studentId,
        isActive: true,
        isPrimary: link.isPrimary === true,
      },
    });
    return toGuardianLinkView(link);
  }

  // RN-13: revocar escribe isActive NULL + revokedAt (nunca FALSE). El motivo va a la bitacora.
  // RN-17: no se puede revocar al ultimo apoderado de un alumno que sigue en el colegio. Si era el
  // principal, el otro apoderado vigente pasa a serlo.
  async revoke(id: string, dto: RevokeLinkDto, actor: Actor): Promise<GuardianLinkView> {
    const found = await this.prisma.guardianStudent.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!found) throw new NotFoundException(USERS_MSG.linkNotFound);

    const promotedId = await this.prisma
      .$transaction(async (tx) => {
        const students = await lockUsersForUpdate(tx, [found.studentId]);
        const student = students.get(found.studentId);
        const link = await tx.guardianStudent.findUnique({
          where: { id },
          select: { id: true, isActive: true, isPrimary: true, createdAt: true },
        });
        if (!link) throw new NotFoundException(USERS_MSG.linkNotFound);
        if (link.isActive !== true) throw new ConflictException(USERS_MSG.linkRevoked);

        const others = await tx.guardianStudent.findMany({
          where: { studentId: found.studentId, isActive: true, id: { not: id } },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (others.length === 0 && student?.status !== 'WITHDRAWN') {
          throw new ConflictException(USERS_MSG.lastGuardian);
        }

        const revokedAt = closeInstant(new Date(), link.createdAt);
        // isPrimary vuelve a NULL junto con isActive (CHECK GuardianStudent_isPrimary_chk).
        const { count } = await tx.guardianStudent.updateMany({
          where: { id, isActive: true },
          data: { isActive: null, isPrimary: null, revokedAt },
        });
        if (count === 0) throw new ConflictException(USERS_MSG.linkRevoked);

        const next = link.isPrimary === true ? others[0] : undefined;
        if (next) {
          await tx.guardianStudent.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
        return next?.id ?? null;
      })
      .catch((e: unknown) => mapPrismaError(e));

    await recordUsers(this.audit, actor, 'guardian_link.revoke', 'GuardianStudent', id, {
      before: { isActive: true },
      after: { isActive: false, reason: dto.reason },
    });
    if (promotedId) {
      await recordUsers(
        this.audit,
        actor,
        'guardian_link.make_primary',
        'GuardianStudent',
        promotedId,
        { before: { isPrimary: false }, after: { isPrimary: true } },
      );
    }
    const updated = await this.prisma.guardianStudent.findUniqueOrThrow({
      where: { id },
      include: linkInclude,
    });
    return toGuardianLinkView(updated);
  }

  // RF-86: cambia cual de los apoderados vigentes es el principal. Primero se quita la marca al
  // anterior para no chocar con el UNIQUE(studentId, isActive, isPrimary).
  async makePrimary(id: string, actor: Actor): Promise<GuardianLinkView> {
    const found = await this.prisma.guardianStudent.findUnique({
      where: { id },
      select: { studentId: true },
    });
    if (!found) throw new NotFoundException(USERS_MSG.linkNotFound);

    const changed = await this.prisma
      .$transaction(async (tx) => {
        await lockUsersForUpdate(tx, [found.studentId]);
        const link = await tx.guardianStudent.findUnique({
          where: { id },
          select: { isActive: true, isPrimary: true },
        });
        if (!link) throw new NotFoundException(USERS_MSG.linkNotFound);
        if (link.isActive !== true) throw new ConflictException(USERS_MSG.linkRevoked);
        if (link.isPrimary === true) return false;
        await tx.guardianStudent.updateMany({
          where: { studentId: found.studentId, isActive: true, isPrimary: true },
          data: { isPrimary: null },
        });
        await tx.guardianStudent.update({ where: { id }, data: { isPrimary: true } });
        return true;
      })
      .catch((e: unknown) => mapPrismaError(e));

    if (changed) {
      await recordUsers(this.audit, actor, 'guardian_link.make_primary', 'GuardianStudent', id, {
        before: { isPrimary: false },
        after: { isPrimary: true },
      });
    }
    const updated = await this.prisma.guardianStudent.findUniqueOrThrow({
      where: { id },
      include: linkInclude,
    });
    return toGuardianLinkView(updated);
  }

  private async findWithRole(id: string, role: 'GUARDIAN' | 'STUDENT'): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!user) throw new NotFoundException(USERS_MSG.userNotFound);
    if (user.role !== role) {
      throw new UnprocessableEntityException(
        role === 'GUARDIAN' ? USERS_MSG.notGuardian : USERS_MSG.notStudent,
      );
    }
  }

  private async list(
    where: Prisma.GuardianStudentWhereInput,
    includeRevoked: boolean,
  ): Promise<LinkList> {
    const rows = await this.prisma.guardianStudent.findMany({
      where: includeRevoked ? where : { ...where, isActive: true },
      include: linkInclude,
      orderBy,
    });
    const items = rows.map(toGuardianLinkView);
    return { items, total: items.length };
  }
}
