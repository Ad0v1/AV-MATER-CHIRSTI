import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from './roles.js';

const PENDING_STEP = 'pendingSetupStep';

// Pasos del primer ingreso, en orden (RF-71): contrasena, correo, 2FA del administrador (RF-85) y
// datos de contacto. Cada ruta
// permitida se marca con el paso a partir del cual se puede usar: 'password' sirve en cualquier
// momento (ver la sesion, cerrarla y cambiar la contrasena); 'email' sirve cuando ya se cambio la
// contrasena (aceptar la politica y verificar el correo); 'contact' cuando ya se verifico el correo.
const STEP_ORDER = { password: 1, email: 2, twofactor: 3, contact: 4 } as const;
type SetupStep = keyof typeof STEP_ORDER;

export const AllowPendingPasswordChange = () =>
  SetMetadata(PENDING_STEP, 'password' satisfies SetupStep);
export const AllowPendingEmailVerification = () =>
  SetMetadata(PENDING_STEP, 'email' satisfies SetupStep);
export const AllowPendingTwoFactor = () =>
  SetMetadata(PENDING_STEP, 'twofactor' satisfies SetupStep);
export const AllowPendingContactData = () =>
  SetMetadata(PENDING_STEP, 'contact' satisfies SetupStep);

type RequestWithUser = Request & { user?: AuthenticatedUser };

// Primer paso que le falta a la sesion, o null si ya los cumplio todos.
function currentStep(user: AuthenticatedUser): SetupStep | null {
  if (user.mustChangePassword) return 'password';
  if (user.mustVerifyEmail) return 'email';
  if (user.mustEnableTwoFactor) return 'twofactor';
  if (user.mustCompleteContact) return 'contact';
  return null;
}

const BLOCKED: Record<SetupStep, { message: string; code: string }> = {
  password: {
    message: 'Debes cambiar tu contraseña antes de continuar',
    code: 'PASSWORD_CHANGE_REQUIRED',
  },
  email: {
    message: 'Debes verificar tu correo antes de continuar',
    code: 'EMAIL_VERIFICATION_REQUIRED',
  },
  twofactor: {
    message: 'Debes activar la verificación en dos pasos antes de continuar',
    code: 'TWO_FACTOR_REQUIRED',
  },
  contact: {
    message: 'Debes completar tus datos de contacto antes de continuar',
    code: 'CONTACT_DATA_REQUIRED',
  },
};

// RN-18: mientras queden pasos del primer ingreso, la API rechaza todo lo demas. Lo impone el
// servidor; la web solo redirige por comodidad.
@Injectable()
export class PendingSetupGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    const pending = user ? currentStep(user) : null;
    if (!pending) return true;

    const routeStep = this.reflector.getAllAndOverride<SetupStep | undefined>(PENDING_STEP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (routeStep && STEP_ORDER[routeStep] <= STEP_ORDER[pending]) return true;
    throw new ForbiddenException(BLOCKED[pending]);
  }
}
