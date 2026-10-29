import { generateSync } from 'otplib';
import type { Env } from '../../config/env.js';
import { MemorySessionStore } from '../../common/session/session.store.js';
import { TotpService } from './totp.service.js';

const newService = () =>
  new TotpService({ TOTP_ISSUER: 'Aula Virtual' } as Env, new MemorySessionStore());

describe('TotpService', () => {
  it('acepta el codigo vigente del secreto', async () => {
    const service = newService();
    const secret = service.newSecret();
    await expect(service.verifyOnce('u1', secret, generateSync({ secret }))).resolves.toBe(true);
  });

  it('rechaza reutilizar el mismo codigo', async () => {
    const service = newService();
    const secret = service.newSecret();
    const code = generateSync({ secret });

    await expect(service.verifyOnce('u1', secret, code)).resolves.toBe(true);
    await expect(service.verifyOnce('u1', secret, code)).resolves.toBe(false);
  });

  it('con dos intentos simultaneos con el mismo codigo, solo uno pasa', async () => {
    const service = newService();
    const secret = service.newSecret();
    const code = generateSync({ secret });

    const results = await Promise.all([
      service.verifyOnce('u1', secret, code),
      service.verifyOnce('u1', secret, code),
      service.verifyOnce('u1', secret, code),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('el codigo usado por un usuario no bloquea a otro con el mismo secreto y codigo', async () => {
    const service = newService();
    const secret = service.newSecret();
    const code = generateSync({ secret });

    await expect(service.verifyOnce('u1', secret, code)).resolves.toBe(true);
    await expect(service.verifyOnce('u2', secret, code)).resolves.toBe(true);
  });

  it('un codigo incorrecto no consume el intervalo', async () => {
    const service = newService();
    const secret = service.newSecret();

    await expect(service.verifyOnce('u1', secret, '000000')).resolves.toBe(false);
    await expect(service.verifyOnce('u1', secret, generateSync({ secret }))).resolves.toBe(true);
  });

  it('no falla con un secreto malformado', async () => {
    await expect(newService().verifyOnce('u1', 'corto', '123456')).resolves.toBe(false);
  });

  it('guarda el secreto cifrado y lo recupera', () => {
    const service = newService();
    const secret = service.newSecret();
    const encrypted = service.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(service.decrypt(encrypted)).toBe(secret);
  });

  it('genera una URL otpauth con el emisor', () => {
    const service = newService();
    expect(service.otpauthUrl('a@b.pe', service.newSecret())).toContain('issuer=Aula%20Virtual');
  });
});
