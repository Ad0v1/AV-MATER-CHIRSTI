// Formas de respuesta de la API de usuarios (docs/03, "API de usuarios (Dev 2, F3)").
// Si cambia el contrato, se actualiza aquí y en docs/03.

import type { EducationLevel } from '../../estructura/_lib/levels';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN';
export type EnrollmentEndReason = 'TRANSFER' | 'WITHDRAWAL' | 'YEAR_END' | 'CORRECTION';

/** `level` (tres niveles, 09/11/2026); si falta se asume SECUNDARIA. */
export type SectionRef = { id: string; level?: EducationLevel; gradeLevel: number; code: string };

export type CredentialStatus = 'NONE' | 'PENDING' | 'READY';

export type UserView = {
  id: string;
  /** Código de usuario de 10 dígitos (RF-68). Nulo en usuarios anteriores al login por código. */
  code: string | null;
  email: string | null;
  contactEmail: string | null;
  emailVerified: boolean;
  phone: string | null;
  address: string | null;
  dniVerified: boolean;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type UserListItem = Omit<UserView, 'createdAt' | 'updatedAt' | 'phone' | 'address'> & {
  currentSection: SectionRef | null;
  credentialStatus: CredentialStatus;
  locked: boolean;
};

/** Credenciales que entrega la API una sola vez (RF-70). */
export type IssuedCredentials = { code: string; initialPassword: string };

export type CreatedStudent = {
  user: UserView;
  credentials: IssuedCredentials;
  enrollment: EnrollmentView;
  guardians: Array<{
    user: UserView;
    link: GuardianLinkView;
    created: boolean;
    credentials?: IssuedCredentials;
  }>;
};

export type CreatedTeacher = { user: UserView; credentials: IssuedCredentials };
export type CreatedGuardian = {
  user: UserView;
  credentials: IssuedCredentials;
  links: GuardianLinkView[];
};
export type ReissuedCredentials = { user: UserView; credentials: IssuedCredentials };

export type UserListPage = {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
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
  /** Apoderado principal: recibe los avisos (RF-86). */
  isPrimary: boolean;
  createdAt: string;
  revokedAt: string | null;
};

/** `GET /users/:id`: la vista más lo propio del rol. */
export type UserDetail = UserView & {
  credentialStatus: CredentialStatus;
  locked: boolean;
  currentEnrollment?: EnrollmentView | null;
  guardians?: GuardianLinkView[];
  students?: GuardianLinkView[];
};

export type List<T> = { items: T[]; total: number };

/** Sección del año activo (de `GET /academic-years/:id/sections`). */
export type SectionOption = {
  id: string;
  academicYearId: string;
  level?: EducationLevel;
  gradeLevel: number;
  code: string;
  isActive: boolean;
};

export type ActiveYearSections = { yearId: string; year: number; sections: SectionOption[] };

/** Estudiante que se puede elegir en el buscador (vínculo con apoderado). */
export type StudentChoice = {
  id: string;
  fullName: string;
  code: string | null;
  status: UserStatus;
  sectionLabel: string | null;
};

/** Resultado de la búsqueda por Server Action (el texto buscado no va en la URL). */
export type SearchState = {
  status: 'idle' | 'ok' | 'error';
  /** Error general (API, red, permisos). */
  message?: string;
  /** Error del campo de búsqueda (largo). */
  fieldError?: string;
  /** Texto buscado, para repetir la búsqueda al cambiar de página. Solo vive en el cliente. */
  q?: string;
  result?: UserListPage;
};

/** Resultado del buscador de estudiantes (vínculo con apoderado). */
export type StudentSearchState = {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  fieldError?: string;
  choices?: StudentChoice[];
  total?: number;
};
