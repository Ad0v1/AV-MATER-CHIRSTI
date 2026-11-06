import { describe, expect, it } from 'vitest';
import {
  auditHref,
  buildAuditQuery,
  hasAuditFilters,
  pageCount,
  parseAuditFilters,
  rangeError,
  rangeText,
  stateText,
} from './audit';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('parseAuditFilters', () => {
  it('lee los filtros válidos', () => {
    expect(
      parseAuditFilters({
        actorId: ID,
        action: 'job.download',
        module: 'jobs',
        from: '2026-03-01',
        to: '2026-03-31',
        page: '3',
      }),
    ).toEqual({
      actorId: ID,
      action: 'job.download',
      module: 'jobs',
      from: '2026-03-01',
      to: '2026-03-31',
      page: 3,
    });
  });

  it('descarta lo inválido en vez de mandarlo a la API', () => {
    expect(
      parseAuditFilters({
        actorId: 'x',
        action: 'DROP TABLE;',
        module: '%',
        from: '2026-02-30',
        page: '-2',
      }),
    ).toEqual({ page: 1 });
  });

  it('ordena el rango invertido y acota la página', () => {
    const f = parseAuditFilters({ from: '2026-05-01', to: '2026-04-01', page: '999' });
    expect(f).toMatchObject({ from: '2026-04-01', to: '2026-05-01', page: 200 });
  });

  it('toma el primer valor si viene repetido', () => {
    expect(parseAuditFilters({ module: ['grading', 'jobs'] }).module).toBe('grading');
  });
});

describe('consulta y enlaces', () => {
  it('convierte los días a instantes de Lima', () => {
    const q = new URLSearchParams(
      buildAuditQuery({ from: '2026-03-01', to: '2026-03-02', page: 2 }),
    );
    expect(q.get('from')).toBe('2026-03-01T00:00:00.000-05:00');
    expect(q.get('to')).toBe('2026-03-02T23:59:59.999-05:00');
    expect(q.get('page')).toBe('2');
  });

  it('sin filtros, la ruta limpia', () => {
    expect(auditHref({ page: 1 })).toBe('/admin/bitacora');
    expect(hasAuditFilters({ page: 4 })).toBe(false);
  });

  it('cambia la página o el actor y conserva lo demás', () => {
    const f = { module: 'grading', page: 2 };
    expect(auditHref(f, { page: 3 })).toBe('/admin/bitacora?module=grading&page=3');
    expect(auditHref(f, { actorId: ID, page: 1 })).toBe(
      `/admin/bitacora?actorId=${ID}&module=grading`,
    );
  });

  it('avisa si el rango pasa de 400 días', () => {
    expect(rangeError({ from: '2025-01-01', to: '2026-12-31', page: 1 })).toMatch(/400/);
    expect(rangeError({ from: '2026-01-01', to: '2026-12-31', page: 1 })).toBeNull();
  });
});

describe('presentación', () => {
  it('cuenta páginas y rango', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(101, 50)).toBe(3);
    expect(pageCount(1_000_000, 50)).toBe(200);
    expect(rangeText(2, 50, 120, 50)).toBe('Mostrando 51–100 de 120');
    expect(rangeText(1, 50, 0, 0)).toBe('Sin resultados');
  });

  it('muestra el estado como JSON acotado', () => {
    expect(stateText(null)).toBeNull();
    expect(stateText({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(stateText({ t: 'x'.repeat(50) }, 10)).toMatch(/…$/);
  });
});

describe('redacción de la vista (seguridad 5g)', () => {
  it('oculta correos y recorta motivos y comentarios largos', () => {
    const text = stateText({
      contactEmail: 'ana@colegio.pe',
      nested: { email: 'x@y.pe', reason: 'r'.repeat(300) },
      comment: 'corto',
    })!;
    expect(text).not.toMatch(/ana@colegio|x@y/);
    expect(text).toMatch(/\[oculto\]/);
    expect(text).toMatch(new RegExp(`"r{200}…"`));
    expect(text).toMatch(/"comment": "corto"/);
  });
});
