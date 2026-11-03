import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  assertApiPath,
  isValidSessionToken,
  sessionCookieHeader,
} from './request-guards';

describe('token de sesión aula_sid', () => {
  const token = 'Ab3_-'.repeat(8) + 'xyz'; // 43 caracteres base64url

  it('acepta un token base64url de 20..128 caracteres', () => {
    expect(isValidSessionToken(token)).toBe(true);
    expect(isValidSessionToken('a'.repeat(20))).toBe(true);
    expect(isValidSessionToken('a'.repeat(128))).toBe(true);
  });

  it('rechaza tokens cortos, largos o con caracteres que permitirían inyectar cabeceras', () => {
    for (const bad of [
      'a'.repeat(19),
      'a'.repeat(129),
      `${token}; otra=1`,
      `${token}\r\nX-Evil: 1`,
      `${token}=`,
      'a+b/c'.repeat(5),
      `${token}
`,
      ` ${token}`,
      'a'.repeat(19) + 'ñ',
      '',
      undefined,
      null,
      42,
      {},
    ]) {
      expect(isValidSessionToken(bad)).toBe(false);
    }
  });

  it('la cabecera Cookie lleva solo aula_sid o nada', () => {
    expect(sessionCookieHeader(token)).toBe(`${SESSION_COOKIE}=${token}`);
    expect(sessionCookieHeader(`${token}; dev-role=admin`)).toBeUndefined();
    expect(sessionCookieHeader(undefined)).toBeUndefined();
    expect(sessionCookieHeader('')).toBeUndefined();
    expect(
      sessionCookieHeader(`${token}

X-Evil: 1`),
    ).toBeUndefined();
  });
});

describe('assertApiPath', () => {
  it('acepta rutas relativas de la API', () => {
    expect(() => assertApiPath('/academic-years')).not.toThrow();
    expect(() => assertApiPath('/courses?includeInactive=true')).not.toThrow();
  });

  it('rechaza URLs absolutas, protocolo relativo, .. y espacios', () => {
    for (const bad of [
      'academic-years',
      'http://evil.example/x',
      '//evil.example/x',
      '/academic-years/../users',
      '/a b',
      '/a\nb',
      '',
    ]) {
      expect(() => assertApiPath(bad)).toThrow('Ruta de API no válida');
    }
  });
});
