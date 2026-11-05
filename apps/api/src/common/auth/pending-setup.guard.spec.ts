import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PendingSetupGuard } from './pending-setup.guard.js';
import type { AuthenticatedUser } from './roles.js';

type Step = 'password' | 'email' | 'contact' | undefined;

function check(user: AuthenticatedUser | undefined, routeStep: Step): boolean {
  const reflector = { getAllAndOverride: () => routeStep } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return new PendingSetupGuard(reflector).canActivate(context);
}

const base = { id: 'u1', role: 'GUARDIAN' as const };

describe('PendingSetupGuard (RN-18)', () => {
  it('sin pasos pendientes deja pasar cualquier ruta', () => {
    expect(check(base, undefined)).toBe(true);
    expect(check(undefined, undefined)).toBe(true);
  });

  it('con la contraseña pendiente solo deja las rutas de ese paso', () => {
    const user = { ...base, mustChangePassword: true as const, mustVerifyEmail: true as const };
    expect(check(user, 'password')).toBe(true);
    expect(() => check(user, 'email')).toThrow(ForbiddenException);
    expect(() => check(user, 'contact')).toThrow(ForbiddenException);
    expect(() => check(user, undefined)).toThrow(ForbiddenException);
  });

  it('con el correo pendiente deja las rutas de contraseña y de correo, no las de contacto', () => {
    const user = { ...base, mustVerifyEmail: true as const, mustCompleteContact: true as const };
    expect(check(user, 'password')).toBe(true);
    expect(check(user, 'email')).toBe(true);
    expect(() => check(user, 'contact')).toThrow(ForbiddenException);
    expect(() => check(user, undefined)).toThrow(ForbiddenException);
  });

  it('con solo el contacto pendiente deja las rutas marcadas y rechaza el resto', () => {
    const user = { ...base, mustCompleteContact: true as const };
    expect(check(user, 'password')).toBe(true);
    expect(check(user, 'email')).toBe(true);
    expect(check(user, 'contact')).toBe(true);
    expect(() => check(user, undefined)).toThrow(ForbiddenException);
  });

  it.each([
    [{ mustChangePassword: true as const }, 'PASSWORD_CHANGE_REQUIRED'],
    [{ mustVerifyEmail: true as const }, 'EMAIL_VERIFICATION_REQUIRED'],
    [{ mustCompleteContact: true as const }, 'CONTACT_DATA_REQUIRED'],
  ])('el rechazo lleva el código del primer paso pendiente (%o)', (flags, code) => {
    try {
      check({ ...base, ...flags }, undefined);
      throw new Error('debía rechazar');
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code });
    }
  });
});
