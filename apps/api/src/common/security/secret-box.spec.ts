import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';

const key = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  it('descifra lo que cifra', () => {
    const box = new SecretBox(key());
    expect(box.decrypt(box.encrypt('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
  });

  it('no repite el cifrado del mismo texto', () => {
    const box = new SecretBox(key());
    expect(box.encrypt('abc')).not.toBe(box.encrypt('abc'));
  });

  it('no deja el texto en claro', () => {
    expect(new SecretBox(key()).encrypt('JBSWY3DPEHPK3PXP')).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('rechaza datos alterados', () => {
    const box = new SecretBox(key());
    const parts = box.encrypt('secreto').split('.');
    parts[3] = Buffer.from('otra-cosa').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('rechaza descifrar con otra clave', () => {
    const encrypted = new SecretBox(key()).encrypt('secreto');
    expect(() => new SecretBox(key()).decrypt(encrypted)).toThrow();
  });
});
