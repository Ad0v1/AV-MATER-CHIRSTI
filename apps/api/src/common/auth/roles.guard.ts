import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator.js';
import type { AuthenticatedUser, UserRole } from './roles.js';

type RequestWithUser = Request & { user?: AuthenticatedUser };

// Si la ruta no declara @Roles, el guard no restringe por rol.
// `request.user` lo llenara la autenticacion de sesion (RF-05/06) cuando exista.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed || allowed.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para esta accion');
    }
    return true;
  }
}
