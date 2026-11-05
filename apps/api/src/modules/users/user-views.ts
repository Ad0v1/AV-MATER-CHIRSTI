// Vistas HTTP del módulo users (Decisión 3). Solo ADMIN las recibe (incluyen el correo).
import type { EnrollmentEndReason, UserRole, UserStatus } from '../../generated/prisma/enums.js';
import { marker, toIso } from '../academic/academic.mappers.js';

export type UserView = {
  id: string;
  // Código de usuario (el usuario del login, RF-68). Nulo solo en usuarios anteriores al login por código.
  code: string | null;
  institutionalEmail: string | null;
  // Correo de contacto que el propio usuario registró y verificó (RF-80).
  contactEmail: string | null;
  emailVerified: boolean;
  // Solo el administrador recibe estos datos (RF-69, RF-83).
  phone: string | null;
  address: string | null;
  dniVerified: boolean;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

// RF-87: NONE = sin contraseña, PENDING = no cambió la inicial, READY = ya cambió la contraseña.
export type CredentialStatus = 'NONE' | 'PENDING' | 'READY';

export type SectionRef = { id: string; gradeLevel: number; code: string };

export type UserListItem = Omit<UserView, 'createdAt' | 'updatedAt' | 'phone' | 'address'> & {
  currentSection: SectionRef | null;
  credentialStatus: CredentialStatus;
  // Bloqueado temporalmente por intentos fallidos (RF-75).
  locked: boolean;
};

export type EnrollmentView = {
  id: string;
  academicYear: { id: string; year: number };
  section: SectionRef;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  endReason: EnrollmentEndReason | null;
};

export type PersonRef = { id: string; fullName: string; status: UserStatus };

export type GuardianLinkView = {
  id: string;
  guardian: PersonRef;
  student: PersonRef;
  isActive: boolean;
  // Apoderado principal del alumno: recibe los avisos (RF-86).
  isPrimary: boolean;
  createdAt: string;
  revokedAt: string | null;
};

type UserRow = {
  id: string;
  code: string | null;
  institutionalEmail: string | null;
  contactEmail: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  address: string | null;
  dniVerifiedAt: Date | null;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export const toUserView = (u: UserRow): UserView => ({
  id: u.id,
  code: u.code,
  institutionalEmail: u.institutionalEmail,
  contactEmail: u.contactEmail,
  emailVerified: u.emailVerifiedAt !== null,
  phone: u.phone,
  address: u.address,
  dniVerified: u.dniVerifiedAt !== null,
  fullName: u.fullName,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});

export const sectionRef = (s: SectionRef): SectionRef => ({
  id: s.id,
  gradeLevel: s.gradeLevel,
  code: s.code,
});

/** include de Prisma para armar EnrollmentView. */
export const enrollmentInclude = {
  section: {
    select: {
      id: true,
      gradeLevel: true,
      code: true,
      academicYear: { select: { id: true, year: true } },
    },
  },
} as const;

type EnrollmentRow = {
  id: string;
  isCurrent: boolean | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  endReason: EnrollmentEndReason | null;
  section: SectionRef & { academicYear: { id: string; year: number } };
};

export const toEnrollmentView = (e: EnrollmentRow): EnrollmentView => ({
  id: e.id,
  academicYear: { id: e.section.academicYear.id, year: e.section.academicYear.year },
  section: sectionRef(e.section),
  isCurrent: marker(e.isCurrent),
  effectiveFrom: e.effectiveFrom.toISOString(),
  effectiveTo: toIso(e.effectiveTo),
  endReason: e.endReason,
});

const personSelect = { select: { id: true, fullName: true, status: true } } as const;

/** include de Prisma para armar GuardianLinkView. */
export const linkInclude = { guardian: personSelect, student: personSelect } as const;

type LinkRow = {
  id: string;
  isActive: boolean | null;
  isPrimary: boolean | null;
  createdAt: Date;
  revokedAt: Date | null;
  guardian: PersonRef;
  student: PersonRef;
};

export const toGuardianLinkView = (l: LinkRow): GuardianLinkView => ({
  id: l.id,
  guardian: { id: l.guardian.id, fullName: l.guardian.fullName, status: l.guardian.status },
  student: { id: l.student.id, fullName: l.student.fullName, status: l.student.status },
  isActive: marker(l.isActive),
  isPrimary: marker(l.isPrimary),
  createdAt: l.createdAt.toISOString(),
  revokedAt: toIso(l.revokedAt),
});
