import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  MAX_FILE_BYTES,
  checkContentLength,
  cleanMultipartContentType,
  isSameOrigin,
  parseAction,
  parseTemplateQuery,
  resolveAction,
  templateDisposition,
  templateFilename,
} from './import-guards';

describe('parseAction / resolveAction', () => {
  it('acepta solo las 3 acciones', () => {
    expect(parseAction('plantilla')).toBe('plantilla');
    expect(parseAction('preview')).toBe('preview');
    expect(parseAction('commit')).toBe('commit');
    for (const bad of ['', 'Preview', 'toString', '__proto__', 'constructor', 'commit/', 1, null]) {
      expect(parseAction(bad)).toBeNull();
    }
  });

  it('404 si la acción no existe y 405 si el método no corresponde', () => {
    expect(resolveAction('otra', 'GET')).toEqual({ ok: false, status: 404 });
    expect(resolveAction('preview', 'GET')).toEqual({ ok: false, status: 405, allow: 'POST' });
    expect(resolveAction('plantilla', 'POST')).toEqual({ ok: false, status: 405, allow: 'GET' });
    expect(resolveAction('commit', 'post')).toEqual({ ok: true, action: 'commit' });
    expect(resolveAction('plantilla', 'GET')).toEqual({ ok: true, action: 'plantilla' });
  });
});

describe('isSameOrigin', () => {
  const base = { host: 'localhost:3000' };

  it('POST exige Origin del mismo host', () => {
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'http://localhost:3000' })).toBe(true);
    expect(isSameOrigin({ ...base, method: 'POST', origin: null })).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: '' })).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'null' })).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'http://evil.example' })).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'http://localhost:3001' })).toBe(false);
    expect(
      isSameOrigin({ ...base, method: 'POST', origin: 'http://localhost:3000.evil.com' }),
    ).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'file://localhost:3000' })).toBe(false);
    expect(isSameOrigin({ ...base, method: 'POST', origin: 'no es url' })).toBe(false);
  });

  it('ignora mayúsculas del host y usa X-Forwarded-Host si existe', () => {
    expect(
      isSameOrigin({ method: 'POST', origin: 'https://AULA.example', host: 'aula.example' }),
    ).toBe(true);
    expect(
      isSameOrigin({
        method: 'POST',
        origin: 'https://aula.example',
        host: 'web:3000',
        forwardedHost: 'aula.example, otro',
      }),
    ).toBe(true);
    expect(
      isSameOrigin({
        method: 'POST',
        origin: 'http://web:3000',
        host: 'web:3000',
        forwardedHost: 'aula.example',
      }),
    ).toBe(false);
  });

  it('sin host no se acepta', () => {
    expect(isSameOrigin({ method: 'POST', origin: 'http://localhost:3000', host: null })).toBe(
      false,
    );
    expect(isSameOrigin({ method: 'GET', origin: null, host: '' })).toBe(false);
  });

  it('GET acepta sin Origin, pero no un Origin ajeno ni Sec-Fetch-Site cruzado', () => {
    expect(isSameOrigin({ ...base, method: 'GET', origin: null })).toBe(true);
    expect(
      isSameOrigin({ ...base, method: 'GET', origin: null, secFetchSite: 'same-origin' }),
    ).toBe(true);
    expect(isSameOrigin({ ...base, method: 'GET', origin: null, secFetchSite: 'none' })).toBe(true);
    expect(isSameOrigin({ ...base, method: 'GET', origin: null, secFetchSite: 'cross-site' })).toBe(
      false,
    );
    expect(isSameOrigin({ ...base, method: 'GET', origin: null, secFetchSite: 'same-site' })).toBe(
      false,
    );
    expect(isSameOrigin({ ...base, method: 'GET', origin: 'http://evil.example' })).toBe(false);
  });

  it('POST con Sec-Fetch-Site distinto de same-origin se rechaza', () => {
    const post = { ...base, method: 'POST', origin: 'http://localhost:3000' };
    expect(isSameOrigin({ ...post, secFetchSite: 'same-origin' })).toBe(true);
    expect(isSameOrigin({ ...post, secFetchSite: 'none' })).toBe(false);
    expect(isSameOrigin({ ...post, secFetchSite: 'cross-site' })).toBe(false);
  });
});

describe('checkContentLength', () => {
  it('rechaza ausente, vacío o no numérico', () => {
    expect(checkContentLength(null)).toEqual({ ok: false, reason: 'missing' });
    expect(checkContentLength(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(checkContentLength('  ')).toEqual({ ok: false, reason: 'missing' });
    for (const bad of ['-1', '1e6', '0x10', '12, 12', '1.5', 'abc']) {
      expect(checkContentLength(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('respeta el tope de 1 MiB + 64 KiB', () => {
    expect(MAX_BODY_BYTES).toBe(MAX_FILE_BYTES + 65_536);
    expect(checkContentLength(String(MAX_BODY_BYTES))).toEqual({
      ok: true,
      length: MAX_BODY_BYTES,
    });
    expect(checkContentLength(String(MAX_BODY_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(checkContentLength('9999999999999999')).toEqual({ ok: false, reason: 'too-large' });
    expect(checkContentLength('0')).toEqual({ ok: false, reason: 'empty' });
    expect(checkContentLength(' 512 ')).toEqual({ ok: true, length: 512 });
  });
});

describe('cleanMultipartContentType', () => {
  it('acepta multipart/form-data con boundary', () => {
    const ct = 'multipart/form-data; boundary=----WebKitFormBoundaryAbC123';
    expect(cleanMultipartContentType(ct)).toBe(ct);
    expect(cleanMultipartContentType('multipart/form-data; boundary="a b"')).toBe(
      'multipart/form-data; boundary="a b"',
    );
  });

  it('rechaza otros tipos, sin boundary, con control o demasiado largo', () => {
    for (const bad of [
      null,
      '',
      'application/json',
      'multipart/form-data',
      'multipart/form-data; charset=utf-8',
      'multipart/mixed; boundary=x',
      'multipart/form-data; boundary=x\r\nX-Inject: 1',
      'multipart/form-data; boundary=ñ',
      `multipart/form-data; boundary=${'a'.repeat(71)}`,
      `multipart/form-data; boundary=x; ${'a'.repeat(200)}`,
    ]) {
      expect(cleanMultipartContentType(bad)).toBeNull();
    }
  });
});

describe('casos límite adicionales (QA 5c)', () => {
  it('RNF-24: boundary de 70 caracteres es válido y con ; extra también', () => {
    const ok = `multipart/form-data; boundary=${'a'.repeat(70)}`;
    expect(cleanMultipartContentType(ok)).toBe(ok);
    const withParam = 'multipart/form-data; boundary=abc; charset=utf-8';
    expect(cleanMultipartContentType(withParam)).toBe(withParam);
    expect(cleanMultipartContentType('MULTIPART/FORM-DATA; boundary=abc')).not.toBeNull();
    expect(cleanMultipartContentType('multipart/form-data; boundary=a\tb')).toBeNull();
  });

  it('RNF-24: Content-Length en el límite exacto y espacios internos', () => {
    expect(checkContentLength('1')).toEqual({ ok: true, length: 1 });
    expect(checkContentLength('00012')).toEqual({ ok: true, length: 12 });
    expect(checkContentLength('1 2')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkContentLength('12345678901234567')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkContentLength('11', 10)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('RNF-24: Origin con puerto implícito, esquema distinto o userinfo', () => {
    const post = { method: 'POST', host: 'aula.example' };
    expect(isSameOrigin({ ...post, origin: 'https://aula.example' })).toBe(true);
    expect(isSameOrigin({ ...post, origin: 'https://aula.example:443' })).toBe(true);
    expect(isSameOrigin({ ...post, origin: 'https://aula.example:8443' })).toBe(false);
    expect(isSameOrigin({ ...post, origin: 'https://evil@aula.example.evil.com' })).toBe(false);
    expect(isSameOrigin({ ...post, origin: 'javascript:alert(1)' })).toBe(false);
  });

  it('RNF-24: método en minúsculas se trata igual y plantilla sin Origin con host en mayúsculas', () => {
    expect(isSameOrigin({ method: 'get', origin: null, host: 'AULA.example' })).toBe(true);
    expect(isSameOrigin({ method: 'post', origin: null, host: 'aula.example' })).toBe(false);
  });

  it('RNF-24: la plantilla acepta solo el Content-Disposition exacto, con espacios alrededor', () => {
    expect(
      templateDisposition('  attachment; filename="plantilla-guardians.csv"  ', 'guardians', 'csv'),
    ).toBe('attachment; filename="plantilla-guardians.csv"');
    expect(
      templateDisposition(
        'attachment; filename="plantilla-guardians.csv"; x=1',
        'guardians',
        'csv',
      ),
    ).toBeNull();
    expect(
      templateDisposition('attachment; filename="plantilla-teachers.csv"', 'guardians', 'csv'),
    ).toBeNull();
  });

  it('RNF-24: resolveAction rechaza rutas con prototipo y mayúsculas', () => {
    for (const bad of ['hasOwnProperty', 'PLANTILLA', 'plantilla ', undefined]) {
      expect(resolveAction(bad, 'GET')).toEqual({ ok: false, status: 404 });
    }
  });
});

describe('parseTemplateQuery', () => {
  const q = (s: string) => parseTemplateQuery(new URLSearchParams(s));

  it('acepta los 3 tipos y 2 formatos', () => {
    for (const type of ['students', 'teachers', 'guardians'] as const) {
      for (const format of ['xlsx', 'csv'] as const) {
        expect(q(`type=${type}&format=${format}`)).toEqual({ type, format });
      }
    }
  });

  it('rechaza valores desconocidos, repetidos, faltantes o extra', () => {
    for (const bad of [
      '',
      'type=students',
      'format=csv',
      'type=admins&format=csv',
      'type=students&format=xls',
      'type=Students&format=csv',
      'type=students&format=csv&x=1',
      'type=students&type=teachers&format=csv',
      'type=students&format=csv&format=xlsx',
      'type=students%0d%0a&format=csv',
    ]) {
      expect(q(bad)).toBeNull();
    }
  });
});

describe('templateDisposition', () => {
  it('copia solo el valor esperado', () => {
    const expected = `attachment; filename="${templateFilename('students', 'xlsx')}"`;
    expect(expected).toBe('attachment; filename="plantilla-students.xlsx"');
    expect(templateDisposition(expected, 'students', 'xlsx')).toBe(expected);
    expect(templateDisposition(null, 'students', 'xlsx')).toBeNull();
    expect(templateDisposition('attachment; filename="otro.exe"', 'students', 'xlsx')).toBeNull();
    expect(templateDisposition('inline', 'students', 'xlsx')).toBeNull();
    expect(
      templateDisposition('attachment; filename="plantilla-students.csv"', 'students', 'xlsx'),
    ).toBeNull();
  });
});
