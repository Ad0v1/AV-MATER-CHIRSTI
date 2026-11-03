import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants.js';
import { ROLES_KEY } from '../../../common/auth/roles.decorator.js';
import type { RequestWithUser } from '../../academic/request-user.js';
import { ActiveActorGuard } from '../active-actor.guard.js';
import { UserImportController } from './user-import.controller.js';
import type { UserImportService } from './user-import.service.js';

const req = { user: { id: 'adm1', role: 'ADMIN' }, ip: '127.0.0.1' } as unknown as RequestWithUser;
const SHA = 'A'.repeat(64);

const file = () => {
  const buffer = Buffer.from('correo,nombre_completo\nana@colegio.example,Ana Pérez\n');
  return { originalname: 'x.csv', size: buffer.length, buffer };
};

describe('UserImportController', () => {
  let service: {
    preview: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    template: ReturnType<typeof vi.fn>;
  };
  let controller: UserImportController;

  beforeEach(() => {
    service = { preview: vi.fn(), commit: vi.fn(), template: vi.fn() };
    controller = new UserImportController(service as unknown as UserImportService);
  });

  it('solo ADMIN activo (clase), multer en preview y commit, límite propio', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserImportController)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(GUARDS_METADATA, UserImportController)).toEqual([ActiveActorGuard]);
    for (const method of ['preview', 'commit'] as const) {
      const handler = UserImportController.prototype[method];
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toHaveLength(1);
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(10);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    }
  });

  it('preview borra el buffer al terminar, también si falla', async () => {
    const ok = file();
    service.preview.mockResolvedValue({ canConfirm: true });
    await controller.preview(ok, { type: 'teachers' });
    expect(service.preview).toHaveBeenCalledWith('teachers', ok);
    expect(ok.buffer.every((b) => b === 0)).toBe(true);

    const failing = file();
    service.preview.mockRejectedValue(new Error('x'));
    await expect(controller.preview(failing, { type: 'teachers' })).rejects.toThrow('x');
    expect(failing.buffer.every((b) => b === 0)).toBe(true);
  });

  it('campos inválidos o de más → 400 y el buffer igual se borra', async () => {
    const f = file();
    await expect(controller.preview(f, { type: 'admins' })).rejects.toThrow(BadRequestException);
    expect(f.buffer.every((b) => b === 0)).toBe(true);
    const g = file();
    await expect(
      controller.commit(g, { type: 'teachers', sha256: SHA, x: '1' }, req),
    ).rejects.toThrow(BadRequestException);
    expect(g.buffer.every((b) => b === 0)).toBe(true);
    await expect(
      controller.commit(file(), { type: 'teachers', sha256: 'abc' }, req),
    ).rejects.toThrow(BadRequestException);
    expect(service.commit).not.toHaveBeenCalled();
  });

  it('commit pasa el hash en minúsculas y el actor; sin campos → 400', async () => {
    const f = file();
    service.commit.mockResolvedValue({ type: 'teachers', created: {} });
    await controller.commit(f, { type: 'teachers', sha256: SHA }, req);
    expect(service.commit).toHaveBeenCalledWith('teachers', 'a'.repeat(64), f, {
      id: 'adm1',
      ip: '127.0.0.1',
    });
    expect(f.buffer.every((b) => b === 0)).toBe(true);
    await expect(controller.preview(undefined, undefined)).rejects.toThrow(BadRequestException);
  });
});
