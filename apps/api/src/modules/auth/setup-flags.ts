import type { AuthenticatedUser, UserRole } from '../../common/auth/roles.js';

type SetupFlags = Pick<
  AuthenticatedUser,
  'mustVerifyEmail' | 'mustEnableTwoFactor' | 'mustCompleteContact'
>;

// Pasos del primer ingreso que le faltan al usuario, ademas de la contrasena (RF-71): el correo
// verificado (RF-80), el 2FA del administrador (RF-85) y, solo para el apoderado, el telefono
// (RF-83).
export function pendingFlags(user: {
  role: UserRole;
  emailVerifiedAt: Date | null;
  phone: string | null;
  localCredential?: { totpSecretEncrypted: string | null } | null;
}): SetupFlags {
  return {
    ...(user.emailVerifiedAt ? {} : { mustVerifyEmail: true as const }),
    ...(user.role === 'ADMIN' && !user.localCredential?.totpSecretEncrypted
      ? { mustEnableTwoFactor: true as const }
      : {}),
    ...(user.role === 'GUARDIAN' && !user.phone ? { mustCompleteContact: true as const } : {}),
  };
}
