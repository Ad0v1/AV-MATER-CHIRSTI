import type { Env } from '../../config/env.js';
import { DniService } from './dni.service.js';

const key = Buffer.alloc(32, 3).toString('base64');
const service = new DniService({ PII_ENCRYPTION_KEY: key } as Env);

describe('DniService', () => {
  it('normaliza solo DNI de 8 digitos', () => {
    expect(service.normalize(' 12345678 ')).toBe('12345678');
    expect(service.normalize('1234567')).toBeNull();
    expect(service.normalize('123456789')).toBeNull();
    expect(service.normalize('1234567a')).toBeNull();
  });

  it('cifra y descifra, y el cifrado no contiene el numero', () => {
    const encrypted = service.encrypt('12345678');
    expect(encrypted).not.toContain('12345678');
    expect(service.decrypt(encrypted)).toBe('12345678');
  });

  it('cifrar dos veces el mismo DNI da resultados distintos', () => {
    expect(service.encrypt('12345678')).not.toBe(service.encrypt('12345678'));
  });

  it('el hash es estable, hexadecimal de 64 caracteres y no es el DNI', () => {
    const hash = service.hash('12345678');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hash('12345678')).toBe(hash);
    expect(service.hash('12345679')).not.toBe(hash);
  });

  it('con otra clave maestra el hash cambia', () => {
    const other = new DniService({
      PII_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    } as Env);
    expect(other.hash('12345678')).not.toBe(service.hash('12345678'));
  });

  it('no puede descifrar con otra clave', () => {
    const other = new DniService({
      PII_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    } as Env);
    expect(() => other.decrypt(service.encrypt('12345678'))).toThrow();
  });
});
