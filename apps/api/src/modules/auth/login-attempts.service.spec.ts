import { afterEach, beforeEach, vi } from 'vitest';
import type { Env } from '../../config/env.js';
import { MemorySessionStore } from '../../common/session/session.store.js';
import { LoginAttemptsService } from './login-attempts.service.js';

const env = { LOGIN_MAX_FAILED_ATTEMPTS: 5, LOGIN_LOCK_SECONDS: 900 } as Env;

describe('LoginAttemptsService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloquea al quinto fallo seguido y solo ese fallo lo informa', async () => {
    const attempts = new LoginAttemptsService(new MemorySessionStore(), env);
    for (let i = 0; i < 4; i++) {
      await expect(attempts.registerFailure('2600000000')).resolves.toBe(false);
    }
    await expect(attempts.isLocked('2600000000')).resolves.toBe(false);

    await expect(attempts.registerFailure('2600000000')).resolves.toBe(true);
    await expect(attempts.isLocked('2600000000')).resolves.toBe(true);
    await expect(attempts.registerFailure('2600000000')).resolves.toBe(false);
  });

  it('cuenta cada codigo por separado', async () => {
    const attempts = new LoginAttemptsService(new MemorySessionStore(), env);
    for (let i = 0; i < 5; i++) await attempts.registerFailure('2600000000');
    await expect(attempts.isLocked('2600000001')).resolves.toBe(false);
  });

  it('un ingreso correcto reinicia el contador', async () => {
    const attempts = new LoginAttemptsService(new MemorySessionStore(), env);
    for (let i = 0; i < 4; i++) await attempts.registerFailure('2600000000');
    await attempts.clear('2600000000');
    for (let i = 0; i < 4; i++) await attempts.registerFailure('2600000000');
    await expect(attempts.isLocked('2600000000')).resolves.toBe(false);
  });

  it('el bloqueo termina a los 15 minutos', async () => {
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
    const attempts = new LoginAttemptsService(new MemorySessionStore(), env);
    for (let i = 0; i < 5; i++) await attempts.registerFailure('2600000000');
    await expect(attempts.isLocked('2600000000')).resolves.toBe(true);

    vi.setSystemTime(new Date('2026-11-05T10:14:59Z'));
    await expect(attempts.isLocked('2600000000')).resolves.toBe(true);
    vi.setSystemTime(new Date('2026-11-05T10:15:01Z'));
    await expect(attempts.isLocked('2600000000')).resolves.toBe(false);
  });

  it('los fallos espaciados mas de la ventana no se acumulan', async () => {
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
    const attempts = new LoginAttemptsService(new MemorySessionStore(), env);
    for (let i = 0; i < 4; i++) await attempts.registerFailure('2600000000');
    vi.setSystemTime(new Date('2026-11-05T10:20:00Z'));
    await expect(attempts.registerFailure('2600000000')).resolves.toBe(false);
    await expect(attempts.isLocked('2600000000')).resolves.toBe(false);
  });
});
