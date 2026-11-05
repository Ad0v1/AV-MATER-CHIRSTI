// Reglas puras del módulo users (sin BD), probadas en users-policy.spec.ts.
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';
import { USERS_MSG } from './users.errors.js';

/** Correo normalizado: sin espacios en los extremos y en minúsculas (Decisión 4.3). */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * true si el correo pertenece al dominio institucional. Sin dominio configurado (null) no se
 * valida. GUARDIAN está exento hasta D-013 (su identidad puede ser externa).
 */
export function checkEmailDomain(email: string, role: UserRole, domain: string | null): boolean {
  if (domain === null || role === 'GUARDIAN') return true;
  return normalizeEmail(email).endsWith(`@${domain.trim().toLowerCase()}`);
}

/** 422 si el correo no cumple el dominio institucional para ese rol. */
export function assertEmailDomain(email: string, role: UserRole, domain: string | null): void {
  if (!checkEmailDomain(email, role, domain)) {
    throw new UnprocessableEntityException(USERS_MSG.emailDomain);
  }
}

/**
 * Instante de cierre de una matrícula o vínculo (Decisión 4.5): la hora del servidor, pero nunca
 * anterior al inicio (CHECK effectiveTo >= effectiveFrom y revokedAt >= createdAt).
 */
export const closeInstant = (now: Date, from: Date): Date =>
  new Date(Math.max(now.getTime(), from.getTime()));

export type StatusChangeInput = {
  actorId: string;
  target: { id: string; role: UserRole; status: UserStatus };
  status: UserStatus;
  /** ADMIN activos distintos del objetivo (solo cuenta si el objetivo es un ADMIN activo). */
  otherActiveAdmins: number;
};

/**
 * 409 si el ADMIN cambia su propio estado o si el cambio deja el sistema sin ADMIN activo
 * (Decisión 4.2). El mismo estado no es error: el servicio responde sin cambios.
 */
export function assertStatusChangeAllowed(input: StatusChangeInput): void {
  if (input.target.id === input.actorId) throw new ConflictException(USERS_MSG.ownStatus);
  const removesActiveAdmin =
    input.target.role === 'ADMIN' && input.target.status === 'ACTIVE' && input.status !== 'ACTIVE';
  if (removesActiveAdmin && input.otherActiveAdmins < 1) {
    throw new ConflictException(USERS_MSG.lastAdmin);
  }
}

export type UserSearchFilters = {
  role?: UserRole;
  status?: UserStatus;
  /** RF-87: NONE sin contraseña, PENDING no cambió la inicial, READY ya la cambió. */
  credentials?: 'NONE' | 'PENDING' | 'READY';
  emailVerified?: 'true' | 'false';
  gradeLevel?: number;
  sectionId?: string;
};

/**
 * Filtro de la búsqueda (RF-25). `matchingIds` son los ids que coinciden con el texto `q`; se
 * calculan aparte con LOCATE porque Prisma `contains` no escapa los comodines % y _.
 * Grado y sección se buscan en la matrícula vigente del año indicado; sin año no hay coincidencias.
 */
export function buildUserSearchWhere(
  filters: UserSearchFilters,
  academicYearId: string | null,
  matchingIds?: string[],
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role;
  if (filters.status) where.status = filters.status;
  if (filters.credentials === 'NONE') where.localCredential = { is: null };
  if (filters.credentials === 'PENDING')
    where.localCredential = { is: { mustChangePassword: true } };
  if (filters.credentials === 'READY')
    where.localCredential = { is: { mustChangePassword: false } };
  if (filters.emailVerified === 'true') where.emailVerifiedAt = { not: null };
  if (filters.emailVerified === 'false') where.emailVerifiedAt = null;
  if (matchingIds !== undefined) where.id = { in: matchingIds };
  if (filters.gradeLevel === undefined && filters.sectionId === undefined) return where;
  if (academicYearId === null) {
    where.id = { in: [] };
    return where;
  }
  where.enrollments = {
    some: {
      academicYearId,
      isCurrent: true,
      ...(filters.sectionId !== undefined ? { sectionId: filters.sectionId } : {}),
      ...(filters.gradeLevel !== undefined ? { section: { gradeLevel: filters.gradeLevel } } : {}),
    },
  };
  return where;
}
