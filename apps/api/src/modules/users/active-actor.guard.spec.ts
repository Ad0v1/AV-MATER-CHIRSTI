import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { ActiveActorGuard } from './active-actor.guard.js';

const contextFor = (user?: AuthenticatedUser): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('ActiveActorGuard', () => {
  const findUnique = vi.fn();
  const guard = new ActiveActorGuard({ user: { findUnique } } as unknown as PrismaService);
  const admin: AuthenticatedUser = { id: 'adm1', role: 'ADMIN' };

  beforeEach(() => findUnique.mockReset());

  it('401 sin sesión', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deja pasar a un ADMIN ACTIVE', async () => {
    findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'ADMIN' });
    await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'adm1' } }));
  });

  it.each(['INACTIVE', 'WITHDRAWN'])(
    '403 si el actor pasó a %s con la sesión abierta',
    async (s) => {
      findUnique.mockResolvedValue({ status: s, role: 'ADMIN' });
      await expect(guard.canActivate(contextFor(admin))).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('403 si el usuario ya no existe o su rol no coincide con la sesión', async () => {
    findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor(admin))).rejects.toBeInstanceOf(ForbiddenException);
    findUnique.mockResolvedValue({ status: 'ACTIVE', role: 'TEACHER' });
    await expect(guard.canActivate(contextFor(admin))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
