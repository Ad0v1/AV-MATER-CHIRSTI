// Nombres alineados con el esquema propuesto (docs/propuestas/schema.propuesto.prisma).
// Decision D-012: un solo rol por usuario.
export const USER_ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'GUARDIAN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthenticatedUser = {
  id: string;
  role: UserRole;
};
