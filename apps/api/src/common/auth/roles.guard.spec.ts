import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './roles.decorator.js';
import type { AuthenticatedUser } from './roles.js';

class AdminOnly {
  @Roles('ADMIN')
  restricted() {}

  open() {}
}

function contextFor(handler: keyof AdminOnly, user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => AdminOnly.prototype[handler],
    getClass: () => AdminOnly,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('permite rutas sin @Roles', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });

  it('rechaza con 401 si no hay usuario autenticado', () => {
    expect(() => guard.canActivate(contextFor('restricted'))).toThrow(UnauthorizedException);
  });

  it('rechaza con 403 si el rol no esta permitido', () => {
    const student = { id: 'u1', role: 'STUDENT' } as const;
    expect(() => guard.canActivate(contextFor('restricted', student))).toThrow(ForbiddenException);
  });

  it('permite el rol indicado', () => {
    const admin = { id: 'u2', role: 'ADMIN' } as const;
    expect(guard.canActivate(contextFor('restricted', admin))).toBe(true);
  });
});
