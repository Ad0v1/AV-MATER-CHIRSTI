import type { Env } from '../../config/env.js';
import { MemorySessionStore } from './session.store.js';
import { SessionService } from './session.service.js';

const env = { SESSION_TTL_SECONDS: 60 } as Env;

describe('SessionService', () => {
  it('crea una sesion que se puede resolver con su token', async () => {
    const service = new SessionService(new MemorySessionStore(), env);
    const token = await service.create({ id: 'u1', role: 'TEACHER' });

    await expect(service.resolve(token)).resolves.toEqual({ id: 'u1', role: 'TEACHER' });
  });

  it('devuelve null para un token desconocido', async () => {
    const service = new SessionService(new MemorySessionStore(), env);
    await expect(service.resolve('no-existe')).resolves.toBeNull();
  });

  it('destruye la sesion', async () => {
    const service = new SessionService(new MemorySessionStore(), env);
    const token = await service.create({ id: 'u1', role: 'ADMIN' });
    await service.destroy(token);

    await expect(service.resolve(token)).resolves.toBeNull();
  });

  it('guarda el hash del token y no el token en claro', async () => {
    const store = new MemorySessionStore();
    const service = new SessionService(store, env);
    const token = await service.create({ id: 'u1', role: 'STUDENT' });

    await expect(store.get(token)).resolves.toBeNull();
    await expect(store.get(`session:${token}`)).resolves.toBeNull();
  });

  it('ignora una sesion con rol invalido', async () => {
    const store = new MemorySessionStore();
    const service = new SessionService(store, env);
    const token = await service.create({ id: 'u1', role: 'STUDENT' });
    // Simula datos corruptos reemplazando el valor guardado.
    const key = [...(store as unknown as { data: Map<string, unknown> }).data.keys()][0]!;
    await store.set(key, JSON.stringify({ id: 'u1', role: 'SUPERUSER' }), 60);

    await expect(service.resolve(token)).resolves.toBeNull();
  });
});
