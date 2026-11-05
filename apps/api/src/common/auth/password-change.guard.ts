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

const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

// Marca las rutas que un usuario con cambio de contrasena pendiente si puede usar
// (ver su sesion, cerrarla y cambiar la contrasena).
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

type RequestWithUser = Request & { user?: AuthenticatedUser };

// RF-71: mientras la contrasena inicial o temporal no se cambie, la API rechaza todo lo demas.
// Lo impone el servidor; la web solo redirige por comodidad.
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user?.mustChangePassword) return true;
    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PENDING_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;
    throw new ForbiddenException({
      message: 'Debes cambiar tu contraseña antes de continuar',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
}
