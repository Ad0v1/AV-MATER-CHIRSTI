import { afterEach, beforeEach, vi } from 'vitest';
import { MemorySessionStore } from '../../common/session/session.store.js';
import { OneTimeCodeService } from './one-time-code.service.js';

describe('OneTimeCodeService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const create = () => new OneTimeCodeService(new MemorySessionStore());

  it('emite un codigo de 6 digitos que se verifica con su contenido', async () => {
    const otc = create();
    const code = await otc.issue('email', 'u1', { email: 'a@b.pe' });
    expect(code).toMatch(/^\d{6}$/);
    await expect(otc.check('email', 'u1', code)).resolves.toEqual({
      ok: true,
      payload: { email: 'a@b.pe' },
    });
  });

  it('un codigo de otro sujeto o de otro uso no sirve', async () => {
    const otc = create();
    const code = await otc.issue('email', 'u1', {});
    await expect(otc.check('email', 'u2', code)).resolves.toMatchObject({ ok: false });
    await expect(otc.check('recovery', 'u1', code)).resolves.toMatchObject({ ok: false });
  });

  it('vence a los 5 minutos', async () => {
    const otc = create();
    const code = await otc.issue('email', 'u1', {});
    vi.setSystemTime(new Date('2026-11-05T10:04:59Z'));
    await expect(otc.check('email', 'u1', code)).resolves.toMatchObject({ ok: true });
    vi.setSystemTime(new Date('2026-11-05T10:05:01Z'));
    await expect(otc.check('email', 'u1', code)).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('al quinto intento fallido invalida el codigo, incluso el correcto', async () => {
    const otc = create();
    const code = await otc.issue('email', 'u1', {});
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      await expect(otc.check('email', 'u1', wrong)).resolves.toEqual({
        ok: false,
        reason: 'WRONG',
      });
    }
    await expect(otc.check('email', 'u1', wrong)).resolves.toEqual({
      ok: false,
      reason: 'EXHAUSTED',
    });
    await expect(otc.check('email', 'u1', code)).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('emitir un codigo nuevo reinicia los intentos y anula el anterior', async () => {
    const otc = create();
    const first = await otc.issue('email', 'u1', {});
    await otc.check('email', 'u1', first === '000000' ? '111111' : '000000');
    const second = await otc.issue('email', 'u1', {});
    if (second !== first) {
      await expect(otc.check('email', 'u1', first)).resolves.toMatchObject({ ok: false });
    }
    await expect(otc.check('email', 'u1', second)).resolves.toMatchObject({ ok: true });
  });

  it('consume borra el codigo', async () => {
    const otc = create();
    const code = await otc.issue('email', 'u1', {});
    await otc.consume('email', 'u1');
    await expect(otc.check('email', 'u1', code)).resolves.toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('limita el reenvio: 1 por minuto y 3 por hora', async () => {
    const otc = create();
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('OK');
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('COOLDOWN');

    vi.setSystemTime(new Date('2026-11-05T10:01:01Z'));
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('OK');
    vi.setSystemTime(new Date('2026-11-05T10:02:02Z'));
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('OK');
    vi.setSystemTime(new Date('2026-11-05T10:03:03Z'));
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('HOURLY');

    vi.setSystemTime(new Date('2026-11-05T11:01:00Z'));
    await expect(otc.allowSend('email', 'u1')).resolves.toBe('OK');
  });

  it('el limite de reenvio es por sujeto', async () => {
    const otc = create();
    await otc.allowSend('email', 'u1');
    await expect(otc.allowSend('email', 'u2')).resolves.toBe('OK');
  });
});
