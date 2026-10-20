import { generateSync } from 'otplib';
import type { Env } from '../../config/env.js';
import { TotpService } from './totp.service.js';

const service = new TotpService({ TOTP_ISSUER: 'Aula Virtual' } as Env);

describe('TotpService', () => {
  it('acepta el codigo vigente del secreto', () => {
    const secret = service.newSecret();
    expect(service.verify(secret, generateSync({ secret }))).toBe(true);
  });

  it('rechaza un codigo incorrecto', () => {
    expect(service.verify(service.newSecret(), '000000')).toBe(false);
  });

  it('no falla con un secreto malformado', () => {
    expect(service.verify('corto', '123456')).toBe(false);
  });

  it('guarda el secreto cifrado y lo recupera', () => {
    const secret = service.newSecret();
    const encrypted = service.encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(service.decrypt(encrypted)).toBe(secret);
  });

  it('genera una URL otpauth con el emisor', () => {
    expect(service.otpauthUrl('a@b.pe', service.newSecret())).toContain('issuer=Aula%20Virtual');
  });
});
