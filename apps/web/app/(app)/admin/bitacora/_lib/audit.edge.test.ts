import { describe, expect, it } from 'vitest';
import {
  AUDIT_MAX_PAGE,
  AUDIT_MAX_RANGE_DAYS,
  auditHref,
  buildAuditQuery,
  hasAuditFilters,
  moduleLabel,
  pageCount,
  parseAuditFilters,
  rangeDays,
  rangeError,
  rangeText,
  stateText,
} from './audit';

// RF-62 / U9: casos límite de la lógica pura de la bitácora. La API es la autoridad
// (admin-audit.dto.ts); estas pruebas fijan que la web no mande nada que la API rechazaría.

const ID = '0F8FAD5B-D9CB-469F-A165-70867728950E';
const DAY = 86_400_000;

describe('RF-62: parseAuditFilters en sus bordes', () => {
  it('actorId en mayúsculas se normaliza; uno que no es UUID se descarta', () => {
    expect(parseAuditFilters({ actorId: ID }).actorId).toBe(ID.toLowerCase());
    expect(parseAuditFilters({ actorId: `${ID}x` }).actorId).toBeUndefined();
    expect(parseAuditFilters({ actorId: '' }).actorId).toBeUndefined();
  });

  it('acción: minúsculas, 100 caracteres sí y 101 no, y sin comodines', () => {
    expect(parseAuditFilters({ action: 'JOB.Download' }).action).toBe('job.download');
    expect(parseAuditFilters({ action: `a${'b'.repeat(99)}` }).action).toHaveLength(100);
    expect(parseAuditFilters({ action: `a${'b'.repeat(100)}` }).action).toBeUndefined();
    for (const bad of ['job%', 'job download', '1job', '.job', "a'b", 'a;b', '_a']) {
      expect(parseAuditFilters({ action: bad }).action, bad).toBeUndefined();
    }
  });

  it('módulo: 40 caracteres sí y 41 no; no admite punto ni mayúsculas', () => {
    expect(parseAuditFilters({ module: `m${'x'.repeat(39)}` }).module).toHaveLength(40);
    expect(parseAuditFilters({ module: `m${'x'.repeat(40)}` }).module).toBeUndefined();
    expect(parseAuditFilters({ module: 'Grading' }).module).toBeUndefined();
    expect(parseAuditFilters({ module: 'a.b' }).module).toBeUndefined();
  });

  it('espacios en blanco cuentan como vacío', () => {
    expect(parseAuditFilters({ action: '   ', module: '\t', actorId: ' ' })).toEqual({ page: 1 });
  });

  it('fechas: solo YYYY-MM-DD reales (bisiesto incluido)', () => {
    expect(parseAuditFilters({ from: '2028-02-29' }).from).toBe('2028-02-29');
    expect(parseAuditFilters({ from: '2027-02-29' }).from).toBeUndefined();
    expect(parseAuditFilters({ from: '2026-13-01' }).from).toBeUndefined();
    expect(parseAuditFilters({ from: '2026-1-1' }).from).toBeUndefined();
    expect(parseAuditFilters({ from: '2026-03-01T00:00:00Z' }).from).toBeUndefined();
    expect(parseAuditFilters({ to: '2026-00-10' }).to).toBeUndefined();
  });

  it('un rango de un solo día no se invierte', () => {
    expect(parseAuditFilters({ from: '2026-03-01', to: '2026-03-01' })).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });

  it('página: 1 y 200 sí; 0, 1,5, texto y 201 se acotan o vuelven a 1', () => {
    expect(parseAuditFilters({ page: '1' }).page).toBe(1);
    expect(parseAuditFilters({ page: String(AUDIT_MAX_PAGE) }).page).toBe(200);
    expect(parseAuditFilters({ page: '201' }).page).toBe(200);
    expect(parseAuditFilters({ page: '0' }).page).toBe(1);
    expect(parseAuditFilters({ page: '1.5' }).page).toBe(1);
    expect(parseAuditFilters({ page: 'abc' }).page).toBe(1);
    expect(parseAuditFilters({ page: '' }).page).toBe(1);
    expect(parseAuditFilters({}).page).toBe(1);
  });
});

describe('RF-62: rango de fechas contra el límite de la API', () => {
  it('rangeDays cuenta días enteros', () => {
    expect(rangeDays('2026-03-01', '2026-03-01')).toBe(0);
    expect(rangeDays('2026-03-01', '2026-03-02')).toBe(1);
    expect(rangeDays('2028-02-28', '2028-03-01')).toBe(2); // bisiesto
  });

  it('400 días calendario (399 de diferencia) son válidos y 400 de diferencia no', () => {
    expect(rangeError({ from: '2026-01-01', to: '2027-02-04', page: 1 })).toBeNull();
    expect(rangeDays('2026-01-01', '2027-02-05')).toBe(AUDIT_MAX_RANGE_DAYS);
    expect(rangeError({ from: '2026-01-01', to: '2027-02-05', page: 1 })).toMatch(/400/);
  });

  it('sin una de las dos fechas no hay error de rango', () => {
    expect(rangeError({ from: '2020-01-01', page: 1 })).toBeNull();
    expect(rangeError({ to: '2020-01-01', page: 1 })).toBeNull();
    expect(rangeError({ page: 1 })).toBeNull();
  });

  // BUG (hallazgo QA 5g): la web da por válido un rango de 400 días, pero buildAuditQuery lo
  // convierte en desde 00:00:00.000 hasta 23:59:59.999 del último día = 400 días + casi 24 h, y la
  // API (auditQuerySchema) responde 400 cuando to - from > 400 días. Cuando se corrija la web (o
  // la API), quitar `.fails` de esta prueba.
  it('RF-62: lo que rangeError acepta, la API también lo acepta (to - from <= 400 días)', () => {
    expect(rangeError({ from: '2026-01-01', to: '2027-02-05', page: 1 })).not.toBeNull();
    const filters = { from: '2026-01-01', to: '2027-02-04', page: 1 };
    expect(rangeError(filters)).toBeNull();
    const q = new URLSearchParams(buildAuditQuery(filters));
    const span = Date.parse(q.get('to')!) - Date.parse(q.get('from')!);
    expect(span).toBeLessThanOrEqual(AUDIT_MAX_RANGE_DAYS * DAY);
  });

  it('un solo día cubre de 00:00 a 23:59:59.999 de Lima', () => {
    const q = new URLSearchParams(
      buildAuditQuery({ from: '2026-03-01', to: '2026-03-01', page: 1 }),
    );
    const span = Date.parse(q.get('to')!) - Date.parse(q.get('from')!);
    expect(span).toBe(DAY - 1);
  });
});

describe('RF-62: consulta y enlaces', () => {
  it('sin filtros la consulta queda vacía y la página 1 no se envía', () => {
    expect(buildAuditQuery({ page: 1 })).toBe('');
    expect(buildAuditQuery({ page: 2 })).toBe('page=2');
  });

  it('solo from o solo to: manda un solo extremo', () => {
    expect(buildAuditQuery({ from: '2026-03-01', page: 1 })).toBe(
      'from=2026-03-01T00%3A00%3A00.000-05%3A00',
    );
    expect(buildAuditQuery({ to: '2026-03-01', page: 1 })).toBe(
      'to=2026-03-01T23%3A59%3A59.999-05%3A00',
    );
  });

  it('la consulta no incluye parámetros que la API no acepta (ni la IP)', () => {
    const q = new URLSearchParams(
      buildAuditQuery({ actorId: ID, action: 'a', module: 'm', from: '2026-03-01', page: 3 }),
    );
    expect([...q.keys()].sort()).toEqual(['action', 'actorId', 'from', 'module', 'page']);
  });

  it('auditHref vuelve a la ruta limpia al quitar la página', () => {
    expect(auditHref({ action: 'a.b', page: 1 })).toBe('/admin/bitacora?action=a.b');
    expect(auditHref({ page: 5 }, { page: 1 })).toBe('/admin/bitacora');
  });

  it('hasAuditFilters ignora la página y detecta cada filtro', () => {
    expect(hasAuditFilters({ page: 9 })).toBe(false);
    const each = [
      { actorId: ID },
      { action: 'a' },
      { module: 'm' },
      { from: '2026-03-01' },
      { to: '2026-03-01' },
    ];
    for (const f of each) expect(hasAuditFilters({ ...f, page: 1 })).toBe(true);
  });
});

describe('RF-62: paginación y presentación en sus límites', () => {
  it('pageCount: 50 filas son 1 página y 51 son 2; tope de 200', () => {
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(10_000, 50)).toBe(200);
    expect(pageCount(10_001, 50)).toBe(200);
  });

  it('pageCount: valores no válidos dan 1 sin lanzar', () => {
    expect(pageCount(-5, 50)).toBe(1);
    expect(pageCount(Number.NaN, 50)).toBe(1);
    expect(pageCount(Number.POSITIVE_INFINITY, 50)).toBe(1);
    expect(pageCount(10, 0)).toBe(1);
  });

  it('rangeText: última página parcial y página vacía', () => {
    expect(rangeText(2, 50, 51, 1)).toBe('Mostrando 51–51 de 51');
    expect(rangeText(1, 50, 50, 50)).toBe('Mostrando 1–50 de 50');
    expect(rangeText(3, 50, 51, 0)).toBe('Sin resultados');
    expect(rangeText(1, 50, 0, 0)).toBe('Sin resultados');
  });

  it('moduleLabel: módulo desconocido se muestra tal cual', () => {
    expect(moduleLabel('grading')).toBe('Calificaciones');
    expect(moduleLabel('desconocido')).toBe('desconocido');
  });

  it('stateText: el máximo exacto no se corta, uno menos sí; no admite ciclos', () => {
    const exact = JSON.stringify('x'.repeat(10), null, 2);
    expect(stateText('x'.repeat(10), exact.length)).toBe(exact);
    expect(stateText('x'.repeat(10), exact.length - 1)).toMatch(/…$/);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(stateText(cyc)).toBeNull();
    expect(stateText(undefined)).toBeNull();
    expect(stateText(0)).toBe('0');
    expect(stateText(false)).toBe('false');
  });

  it('stateText: el HTML se devuelve como texto (se muestra en un <pre>)', () => {
    expect(stateText({ n: '<img src=x onerror=alert(1)>' })).toContain('<img src=x');
  });
});
