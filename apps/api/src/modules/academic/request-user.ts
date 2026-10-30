import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/roles.js';

// Único punto del módulo que lee la sesión (igual que auth.controller.ts).
// Si Dev 1 cambia la forma de req.user, solo se ajusta este archivo.
export type RequestWithUser = Request & { user?: AuthenticatedUser };

export type Actor = { id: string; ip?: string };

export function currentUser(req: RequestWithUser): AuthenticatedUser {
  if (!req.user) throw new UnauthorizedException('Debes iniciar sesion');
  return req.user;
}

export function actorOf(req: RequestWithUser): Actor {
  return { id: currentUser(req).id, ip: req.ip };
}
