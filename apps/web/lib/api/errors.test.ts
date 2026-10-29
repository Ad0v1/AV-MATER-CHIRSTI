import { describe, expect, it } from 'vitest';
import { periodPathLabel } from '../../app/(app)/admin/estructura/_lib/validation';
import {
  ApiError,
  DEV_SESSION_COMMAND,
  NETWORK_ERROR_STATUS,
  detailMessages,
  networkError,
  parseApiError,
  toUserMessage,
} from './errors';

const envelope = (code: string, message: string, details: unknown[] = []) => ({
  error: { code, message, details },
  requestId: 'req-1',
});

describe('parseApiError', () => {
  it('lee el sobre de error de la API', () => {
    const e = parseApiError(409, envelope('CONFLICT', 'El año académico ya existe'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('CONFLICT');
    expect(e.message).toBe('El año académico ya existe');
    expect(e.requestId).toBe('req-1');
  });

  it('lee details válidos y descarta los mal formados', () => {
    const e = parseApiError(
      422,
      envelope('BUSINESS_RULE_VIOLATION', 'Solicitud invalida', [
        { path: 'periods.2', message: 'El período se solapa con el anterior' },
        { path: 3, message: 'sin path de texto' },
        { message: '' },
        'texto suelto',
        null,
      ]),
    );
    expect(e.details).toEqual([
      { path: 'periods.2', message: 'El período se solapa con el anterior' },
      { path: '', message: 'sin path de texto' },
    ]);
  });

  it('tolera cuerpos que no son el sobre (413 de multer, HTML, vacío)', () => {
    for (const body of [{ message: 'File too large' }, '<html></html>', undefined, null, 42]) {
      const e = parseApiError(413, body);
      expect(e.status).toBe(413);
      expect(e.code).toBe('ERROR');
      expect(e.message).toBe('');
      expect(e.details).toEqual([]);
    }
  });

  it('descarta mensajes demasiado largos y limita la cantidad de details', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ path: `p${i}`, message: `m${i}` }));
    const e = parseApiError(400, envelope('VALIDATION_ERROR', 'x'.repeat(301), many));
    expect(e.message).toBe('');
    expect(e.details).toHaveLength(20);
  });
});

describe('toUserMessage', () => {
  const err = (status: number, message = '') => new ApiError(status, 'X', message);

  it('401 en desarrollo muestra el comando de la sesión local', () => {
    expect(toUserMessage(err(401, 'Debes iniciar sesion'), { isProduction: false })).toContain(
      DEV_SESSION_COMMAND,
    );
  });

  it('401 en producción pide iniciar sesión y no muestra el comando', () => {
    const msg = toUserMessage(err(401), { isProduction: true });
    expect(msg).toMatch(/Inicia sesión/);
    expect(msg).not.toContain('dev-session');
  });

  it('403 usa un texto propio con tildes (no el de la API)', () => {
    expect(toUserMessage(err(403, 'No tienes permiso para esta accion'))).toBe(
      'No tienes permiso para realizar esta acción.',
    );
  });

  it('409 y 422 muestran el mensaje en español de la API', () => {
    expect(toUserMessage(err(409, 'El período ya está cerrado'))).toBe(
      'El período ya está cerrado',
    );
    expect(toUserMessage(err(422, 'El curso está inactivo'))).toBe('El curso está inactivo');
  });

  it('usa un texto propio si la API manda "Solicitud invalida" o nada', () => {
    expect(toUserMessage(err(400, 'Solicitud invalida'))).toBe('Revisa los datos ingresados.');
    expect(toUserMessage(err(422, 'Solicitud invalida'))).toMatch(/reglas/);
    expect(toUserMessage(err(404))).toMatch(/no existe/);
    expect(toUserMessage(err(409))).toMatch(/cambió o está en uso/);
  });

  it('413, 429, 5xx y red tienen textos propios', () => {
    expect(toUserMessage(err(413, 'File too large'))).toBe(
      'El archivo supera el tamaño permitido.',
    );
    expect(toUserMessage(err(429))).toMatch(/demasiadas solicitudes/);
    expect(toUserMessage(err(500, 'Error interno del servidor'))).toMatch(
      /servidor tuvo un problema/,
    );
    expect(toUserMessage(err(503))).toMatch(/servidor tuvo un problema/);
    expect(networkError().status).toBe(NETWORK_ERROR_STATUS);
    expect(toUserMessage(networkError())).toMatch(/No se pudo conectar/);
  });

  it('un error que no es ApiError no filtra su mensaje', () => {
    expect(toUserMessage(new Error('ECONNREFUSED 127.0.0.1:4000'))).not.toContain('127.0.0.1');
    expect(toUserMessage('cualquier cosa')).toMatch(/No se pudo completar/);
  });
});

describe('detailMessages', () => {
  it('antepone la etiqueta y quita repetidos', () => {
    const e = new ApiError(422, 'X', '', [
      { path: 'periods.1', message: 'La fecha no es válida' },
      { path: 'periods.1', message: 'La fecha no es válida' },
      { path: 'otro', message: 'Otro problema' },
    ]);
    const label = (p: string) => (p === 'periods.1' ? 'I Bimestre' : undefined);
    expect(detailMessages(e, label)).toEqual([
      'I Bimestre: La fecha no es válida',
      'Otro problema',
    ]);
  });

  it('devuelve vacío si no es ApiError', () => {
    expect(detailMessages(new Error('x'))).toEqual([]);
  });
});

describe('QA: casos límite de errores (entrega 5a)', () => {
  const err = (status: number, message = '') => new ApiError(status, 'X', message);

  it('parseApiError: details que no es arreglo, envelope sin error y code inválido', () => {
    const a = parseApiError(400, { error: { code: 'X', message: 'm', details: 'texto' } });
    expect(a.details).toEqual([]);
    const b = parseApiError(500, { error: 'cadena' });
    expect(b.code).toBe('ERROR');
    expect(b.message).toBe('');
    const c = parseApiError(400, { error: { code: 123, message: ['x'] } });
    expect(c.code).toBe('ERROR');
    expect(c.message).toBe('');
    expect(parseApiError(400, { error: { code: '  ', message: '   ' } }).code).toBe('ERROR');
  });

  it('parseApiError: requestId ausente o no texto queda undefined; se recorta', () => {
    expect(parseApiError(500, { error: { code: 'X', message: 'm' } }).requestId).toBeUndefined();
    expect(parseApiError(500, { requestId: 7 }).requestId).toBeUndefined();
    expect(parseApiError(500, { requestId: '  abc  ' }).requestId).toBe('abc');
  });

  it('parseApiError: mensaje de 300 se conserva y de 301 se descarta', () => {
    expect(parseApiError(400, envelope('X', 'a'.repeat(300))).message).toHaveLength(300);
    expect(parseApiError(400, envelope('X', 'a'.repeat(301))).message).toBe('');
  });

  it('toUserMessage: cada status con texto propio', () => {
    const cases: Array<[number, RegExp]> = [
      [400, /Revisa los datos/],
      [403, /No tienes permiso/],
      [404, /no existe/],
      [409, /cambió o está en uso/],
      [413, /supera el tamaño/],
      [422, /reglas del sistema/],
      [429, /demasiadas solicitudes/],
      [500, /servidor tuvo un problema/],
      [502, /servidor tuvo un problema/],
      [504, /servidor tuvo un problema/],
      [418, /No se pudo completar/],
      [302, /No se pudo completar/],
    ];
    for (const [status, re] of cases) expect(toUserMessage(err(status))).toMatch(re);
  });

  it('toUserMessage: 400/404 muestran el mensaje de la API si es útil', () => {
    expect(toUserMessage(err(400, 'El año debe estar entre 2000 y 2100'))).toBe(
      'El año debe estar entre 2000 y 2100',
    );
    expect(toUserMessage(err(404, 'Sección no encontrada'))).toBe('Sección no encontrada');
    expect(toUserMessage(err(404, 'Solicitud invalida'))).toMatch(/no existe/);
  });

  it('toUserMessage: 403/413/429/5xx ignoran el texto del servidor', () => {
    for (const s of [403, 413, 429, 500]) {
      expect(toUserMessage(err(s, 'SELECT * FROM users stack trace'))).not.toMatch(/SELECT/);
    }
  });

  it('toUserMessage: 401 en producción y desarrollo', () => {
    expect(toUserMessage(err(401), { isProduction: true })).toBe(
      'Tu sesión terminó o no has iniciado sesión. Inicia sesión de nuevo.',
    );
    const dev = toUserMessage(err(401), { isProduction: false });
    expect(dev).toMatch(/^No hay sesión activa/);
    expect(dev).toContain('prisma/seed/dev-session.ts');
  });

  it('toUserMessage: sin opciones usa NODE_ENV (test equivale a desarrollo)', () => {
    expect(toUserMessage(err(401))).toContain(DEV_SESSION_COMMAND);
  });

  it('toUserMessage: red, null y undefined', () => {
    expect(toUserMessage(networkError(), { isProduction: true })).toMatch(/No se pudo conectar/);
    expect(toUserMessage(null)).toMatch(/No se pudo completar/);
    expect(toUserMessage(undefined)).toMatch(/No se pudo completar/);
  });

  it('detailMessages: periods.N (secuencia) y periods.N.campo (índice Zod) con etiquetas', () => {
    const e = new ApiError(422, 'X', '', [
      { path: 'periods.2', message: 'Se solapa con el período anterior' },
      { path: 'periods.0.startDate', message: 'Fecha no válida' },
      { path: 'periods.3.endDate', message: 'Fecha no válida' },
      { path: 'periods.9', message: 'Sin etiqueta' },
    ]);
    expect(detailMessages(e, periodPathLabel)).toEqual([
      'II Bimestre: Se solapa con el período anterior',
      'I Bimestre: Fecha no válida',
      'IV Trimestre: Fecha no válida',
      'Sin etiqueta',
    ]);
  });

  it('detailMessages: sin etiqueta se deduplica; con etiqueta se conservan', () => {
    expect(detailMessages(err(422))).toEqual([]);
    const e = new ApiError(422, 'X', '', [
      { path: 'periods.1', message: 'Fecha no válida' },
      { path: 'periods.2', message: 'Fecha no válida' },
    ]);
    expect(detailMessages(e)).toEqual(['Fecha no válida']);
    expect(detailMessages(e, periodPathLabel)).toHaveLength(2);
  });

  it('detailMessages: valores que no son ApiError', () => {
    expect(detailMessages(null)).toEqual([]);
    expect(detailMessages('x')).toEqual([]);
  });
});
