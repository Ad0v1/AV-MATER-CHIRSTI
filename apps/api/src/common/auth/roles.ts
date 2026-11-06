// Nombres alineados con el esquema propuesto (docs/propuestas/schema.propuesto.prisma).
// Decision D-012: un solo rol por usuario.
export const USER_ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'GUARDIAN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthenticatedUser = {
  id: string;
  role: UserRole;
  // Solo vienen en true: pasos del primer ingreso que la sesion aun no cumplio (RF-71, RN-18).
  mustChangePassword?: true;
  mustVerifyEmail?: true;
  // Administrador que aun no activa el 2FA (RF-85).
  mustEnableTwoFactor?: true;
  // Apoderado que aun no registro su telefono (RF-83).
  mustCompleteContact?: true;
};
