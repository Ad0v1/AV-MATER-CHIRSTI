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
import { mapPrismaError } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { INSTITUTION_EMAIL_DOMAIN } from './institution-domain.js';
import {
  linkInclude,
  toGuardianLinkView,
  toUserView,
  type GuardianLinkView,
  type UserView,
} from './user-views.js';
import { recordUsers } from './users-audit.js';
import { lockUsersForUpdate, type LockedUser } from './users-locks.js';
import { assertEmailDomain, closeInstant } from './users-policy.js';
import { assertEmailFree } from './users-queries.js';
import type {
  CreateGuardianDto,
  LinkStudentDto,
  ListLinksQuery,
  RevokeLinkDto,
} from './users.dto.js';
import { USERS_MSG } from './users.errors.js';

export type LinkList = { items: GuardianLinkView[]; total: number };

/** 422 si el usuario no es un STUDENT vinculable (no existe en el cuerpo, otro rol o WITHDRAWN). */
function assertLinkableStudent(student: LockedUser | undefined): void {
  if (!student) throw new UnprocessableEntityException(USERS_MSG.studentNotFound);
  if (student.role !== 'STUDENT') throw new UnprocessableEntityException(USERS_MSG.notStudent);
  if (student.status === 'WITHDRAWN') {
    throw new UnprocessableEntityException(USERS_MSG.studentWithdrawn);
  }
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
    @Inject(INSTITUTION_EMAIL_DOMAIN) private readonly domain: string | null,
  ) {}

  // RF-20: apoderado con al menos un estudiante, en una transacción (estudiantes bloqueados).
  async createGuardian(
    dto: CreateGuardianDto,
    actor: Actor,
  ): Promise<{ user: UserView; links: GuardianLinkView[] }> {
    assertEmailDomain(dto.institutionalEmail, 'GUARDIAN', this.domain); // exento hasta D-013
    await assertEmailFree(this.prisma, dto.institutionalEmail);

    const { user, links } = await this.prisma
      .$transaction(async (tx) => {
        const students = await lockUsersForUpdate(tx, dto.studentIds);
        for (const id of dto.studentIds) assertLinkableStudent(students.get(id));
        const created = await tx.user.create({
          data: {
            institutionalEmail: dto.institutionalEmail,
            fullName: dto.fullName,
            role: 'GUARDIAN',
          },
        });
        const createdLinks = [];
        for (const studentId of dto.studentIds) {
          createdLinks.push(
            await tx.guardianStudent.create({
              data: { guardianId: created.id, studentId },
              include: linkInclude,
            }),
          );
        }
        return { user: created, links: createdLinks };
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.emailTaken));

    await recordUsers(this.audit, actor, 'user.create', 'User', user.id, {
      after: { role: user.role, status: user.status },
    });
    for (const link of links) {
      await recordUsers(this.audit, actor, 'guardian_link.create', 'GuardianStudent', link.id, {
        after: { guardianId: link.guardianId, studentId: link.studentId, isActive: true },
      });
    }
    return { user: toUserView(user), links: links.map(toGuardianLinkView) };
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
        return tx.guardianStudent.create({
          data: { guardianId, studentId: dto.studentId },
          include: linkInclude,
        });
      })
      .catch((e: unknown) => mapPrismaError(e, USERS_MSG.linkDuplicate));

    await recordUsers(this.audit, actor, 'guardian_link.create', 'GuardianStudent', link.id, {
      after: { guardianId, studentId: dto.studentId, isActive: true },
    });
    return toGuardianLinkView(link);
  }

  // RN-13: revocar escribe isActive NULL + revokedAt (nunca FALSE). El motivo va a la bitácora.
  async revoke(id: string, dto: RevokeLinkDto, actor: Actor): Promise<GuardianLinkView> {
    const link = await this.prisma.guardianStudent.findUnique({
      where: { id },
      select: { id: true, isActive: true, createdAt: true },
    });
    if (!link) throw new NotFoundException(USERS_MSG.linkNotFound);
    if (link.isActive !== true) throw new ConflictException(USERS_MSG.linkRevoked);
    const revokedAt = closeInstant(new Date(), link.createdAt);
    const { count } = await this.prisma.guardianStudent
      .updateMany({ where: { id, isActive: true }, data: { isActive: null, revokedAt } })
      .catch((e: unknown) => mapPrismaError(e));
    if (count === 0) throw new ConflictException(USERS_MSG.linkRevoked);

    await recordUsers(this.audit, actor, 'guardian_link.revoke', 'GuardianStudent', id, {
      before: { isActive: true },
      after: { isActive: false, reason: dto.reason },
    });
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
