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

// Pasos del primer ingreso, en orden (RF-71): primero la contrasena, despues el correo.
// Una ruta marcada 'password' la puede usar quien tenga pasos pendientes (ver la sesion, cerrarla
// y cambiar la contrasena). Una marcada 'email' solo la puede usar quien ya cambio la contrasena
// (aceptar la politica y verificar el correo).
type SetupStep = 'password' | 'email';

export const AllowPendingPasswordChange = () =>
  SetMetadata(PENDING_STEP, 'password' satisfies SetupStep);
export const AllowPendingEmailVerification = () =>
  SetMetadata(PENDING_STEP, 'email' satisfies SetupStep);

type RequestWithUser = Request & { user?: AuthenticatedUser };

// RN-18: mientras queden pasos del primer ingreso, la API rechaza todo lo demas. Lo impone el
// servidor; la web solo redirige por comodidad.
@Injectable()
export class PendingSetupGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user?.mustChangePassword && !user?.mustVerifyEmail) return true;

    const step = this.reflector.getAllAndOverride<SetupStep | undefined>(PENDING_STEP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (user.mustChangePassword) {
      if (step === 'password') return true;
      throw new ForbiddenException({
        message: 'Debes cambiar tu contraseña antes de continuar',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    if (step) return true;
    throw new ForbiddenException({
      message: 'Debes verificar tu correo antes de continuar',
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
  }
}
