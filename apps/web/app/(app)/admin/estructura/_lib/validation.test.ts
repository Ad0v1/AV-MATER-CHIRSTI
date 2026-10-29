import { describe, expect, it } from 'vitest';
import {
  REASON_LIMITS,
  REASON_NOTICE,
  defaultPeriodDates,
  isDateOnly,
  isUuid,
  normalizeCourseName,
  normalizeSectionCode,
  parseYear,
  periodPathLabel,
  reasonCounter,
  validatePeriodDrafts,
  validateReason,
} from './validation';
import { formatInstant, sectionLabel, yearStatus } from './format';

describe('límites de motivos (mismos que la API)', () => {
  const reopen = REASON_LIMITS.reopenPeriod;
  const close = REASON_LIMITS.closePeriod;

  it('reabrir exige 10..500 caracteres contados sin espacios en los extremos', () => {
    expect(validateReason('', reopen)).toMatch(/Escribe el motivo/);
    expect(validateReason('          ', reopen)).toMatch(/Escribe el motivo/);
    expect(validateReason('123456789', reopen)).toMatch(/al menos 10/);
    expect(validateReason('  123456789  ', reopen)).toMatch(/al menos 10/);
    expect(validateReason('1234567890', reopen)).toBeNull();
    expect(validateReason('x'.repeat(500), reopen)).toBeNull();
    expect(validateReason('x'.repeat(501), reopen)).toMatch(/500/);
  });

  it('cerrar acepta motivo vacío o de 1..500', () => {
    expect(validateReason('', close)).toBeNull();
    expect(validateReason('   ', close)).toBeNull();
    expect(validateReason('a', close)).toBeNull();
    expect(validateReason('x'.repeat(501), close)).toMatch(/500/);
  });

  it('el contador cuenta como la API y muestra el mínimo si es obligatorio', () => {
    expect(reasonCounter('  hola  ', close)).toBe('4 de 500 caracteres');
    expect(reasonCounter('hola', reopen)).toBe('4 de 500 caracteres (mínimo 10)');
  });

  it('el aviso fijo advierte que no se escriban datos de estudiantes', () => {
    expect(REASON_NOTICE).toMatch(/bitácora/);
    expect(REASON_NOTICE).toMatch(/datos personales de estudiantes/);
  });
});

describe('validaciones de forma', () => {
  it('isUuid', () => {
    expect(isUuid('0b8f6f0e-1d2c-4c1a-9d3e-2f4a5b6c7d8e')).toBe(true);
    expect(isUuid('../../users')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('isDateOnly solo acepta días reales YYYY-MM-DD', () => {
    expect(isDateOnly('2026-03-01')).toBe(true);
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2028-02-29')).toBe(true);
    expect(isDateOnly('01/03/2026')).toBe(false);
    expect(isDateOnly('2026-3-1')).toBe(false);
  });

  it('parseYear acepta 2000..2100', () => {
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear(' 2100 ')).toBe(2100);
    expect(parseYear('1999')).toBeNull();
    expect(parseYear('2101')).toBeNull();
    expect(parseYear('20a6')).toBeNull();
  });

  it('normalizeSectionCode pasa a mayúsculas y exige [A-Z0-9]{1,8}', () => {
    expect(normalizeSectionCode(' b2 ')).toBe('B2');
    expect(normalizeSectionCode('ñ')).toBeNull();
    expect(normalizeSectionCode('')).toBeNull();
    expect(normalizeSectionCode('ABCDEFGHI')).toBeNull();
  });

  it('normalizeCourseName exige 1..120 caracteres', () => {
    expect(normalizeCourseName('  Matemática ')).toBe('Matemática');
    expect(normalizeCourseName('   ')).toBeNull();
    expect(normalizeCourseName('x'.repeat(121))).toBeNull();
  });
});

describe('períodos', () => {
  it('las fechas sugeridas pasan la validación local', () => {
    expect(validatePeriodDrafts(2027, defaultPeriodDates(2027))).toEqual({});
  });

  it('detecta fecha inválida, fuera del año, fin antes del inicio y solape', () => {
    const periods = defaultPeriodDates(2027);
    periods[0] = { sequence: 1, startDate: '2026-12-31', endDate: '2027-04-30' };
    periods[1] = { sequence: 2, startDate: '2027-04-30', endDate: '2027-06-30' };
    periods[2] = { sequence: 3, startDate: '2027-09-30', endDate: '2027-07-01' };
    periods[3] = { sequence: 4, startDate: '2027-02-30', endDate: '2027-12-31' };
    const errors = validatePeriodDrafts(2027, periods);
    expect(errors.p1_start).toMatch(/dentro del año 2027/);
    expect(errors.p2_start).toMatch(/solapa/);
    expect(errors.p3_end).toMatch(/anterior al inicio/);
    expect(errors.p4_start).toMatch(/fecha válida/);
  });

  it('periodPathLabel entiende los dos formatos de path de la API', () => {
    expect(periodPathLabel('periods.2')).toBe('II Bimestre'); // regla de fechas: secuencia
    expect(periodPathLabel('periods.2.startDate')).toBe('III Trimestre'); // Zod: índice
    expect(periodPathLabel('year')).toBeUndefined();
    expect(periodPathLabel('periods.x')).toBeUndefined();
  });
});

describe('QA: casos límite de validación (entrega 5a)', () => {
  const reopen = REASON_LIMITS.reopenPeriod;
  const close = REASON_LIMITS.closePeriod;

  it('RF-11: reapertura en los bordes 9/10 y 500/501 tras trim', () => {
    expect(validateReason(` ${'x'.repeat(9)} `, reopen)).toMatch(/al menos 10/);
    expect(validateReason(` ${'x'.repeat(10)} `, reopen)).toBeNull();
    expect(validateReason(` ${'x'.repeat(500)} `, reopen)).toBeNull();
    expect(validateReason(` ${'x'.repeat(501)} `, reopen)).toMatch(/500/);
    expect(validateReason('\t\n  \n', reopen)).toMatch(/Escribe el motivo/);
  });

  it('RF-11: cierre opcional, borde 500/501 y espacios internos cuentan', () => {
    expect(validateReason('x'.repeat(500), close)).toBeNull();
    expect(validateReason(`${'x'.repeat(250)} ${'y'.repeat(250)}`, close)).toMatch(/500/);
    expect(validateReason('a b', close)).toBeNull();
  });

  it('isUuid rechaza valores manipulados', () => {
    const ok = '0b8f6f0e-1d2c-4c1a-9d3e-2f4a5b6c7d8e';
    expect(isUuid(ok.toUpperCase())).toBe(true);
    const bad: unknown[] = [
      `${ok}\n`,
      ` ${ok}`,
      `${ok}/../x`,
      `${ok}x`,
      ok.slice(1),
      '',
      null,
      123,
      true,
      {},
      [ok],
      "'; DROP TABLE users;--",
    ];
    for (const v of bad) expect(isUuid(v)).toBe(false);
  });

  it('isDateOnly rechaza formatos manipulados y respeta bisiestos', () => {
    const bad = [
      '',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2026-03-01T00:00:00Z',
      ' 2026-03-01',
      '2026-03-01\n',
      '2026/03/01',
      '20260301',
      '2027-02-29',
    ];
    for (const v of bad) expect(isDateOnly(v)).toBe(false);
    expect(isDateOnly('2100-12-31')).toBe(true);
    expect(isDateOnly('2000-02-29')).toBe(true);
    expect(isDateOnly('2100-02-29')).toBe(false);
  });

  it('parseYear: bordes y entradas raras', () => {
    expect(parseYear('2000')).toBe(2000);
    for (const v of ['', '  ', '+2026', '2026.0', '02026', '2026\n2027', '-2026']) {
      expect(parseYear(v)).toBeNull();
    }
  });

  it('períodos: fin igual al inicio es válido; inicio igual al fin anterior se solapa', () => {
    const p = defaultPeriodDates(2027);
    p[0] = { sequence: 1, startDate: '2027-03-01', endDate: '2027-03-01' };
    expect(validatePeriodDrafts(2027, p)).toEqual({});
    p[1] = { sequence: 2, startDate: '2027-03-01', endDate: '2027-06-30' };
    expect(validatePeriodDrafts(2027, p).p2_start).toMatch(/solapa/);
  });

  it('períodos: se ordenan por secuencia y valida fin fuera del año', () => {
    const p = defaultPeriodDates(2027).reverse();
    expect(validatePeriodDrafts(2027, p)).toEqual({});
    const q = defaultPeriodDates(2027);
    q[3] = { sequence: 4, startDate: '2027-10-01', endDate: '2028-01-01' };
    expect(validatePeriodDrafts(2027, q).p4_end).toMatch(/dentro del año 2027/);
  });

  it('períodos: fecha inválida no genera error de solape en cascada', () => {
    const p = defaultPeriodDates(2027);
    p[0] = { sequence: 1, startDate: '2027-03-01', endDate: 'basura' };
    const e = validatePeriodDrafts(2027, p);
    expect(e.p1_end).toMatch(/fecha válida/);
    expect(e.p2_start).toBeUndefined();
  });

  it('normalizaciones: código de sección y nombre de curso en bordes', () => {
    expect(normalizeSectionCode('ABCDEFGH')).toBe('ABCDEFGH');
    expect(normalizeSectionCode('a-b')).toBeNull();
    expect(normalizeSectionCode('A B')).toBeNull();
    expect(normalizeCourseName('x'.repeat(120))).toBe('x'.repeat(120));
    expect(normalizeCourseName(` ${'x'.repeat(120)} `)).toBe('x'.repeat(120));
  });

  it('periodPathLabel: paths manipulados', () => {
    expect(periodPathLabel('periods')).toBeUndefined();
    expect(periodPathLabel('periods.-1')).toBeUndefined();
    expect(periodPathLabel('periods.0')).toBeUndefined();
    expect(periodPathLabel('periods.4')).toBe('IV Trimestre');
    expect(periodPathLabel('periods.4.startDate')).toBeUndefined();
    expect(periodPathLabel('other.1')).toBeUndefined();
  });
});

describe('formatos', () => {
  it('formatInstant usa la hora de Lima (UTC-5)', () => {
    const text = formatInstant('2026-07-01T04:30:00.000Z');
    expect(text).toMatch(/30 jun/);
    expect(text).toMatch(/11:30/);
    expect(formatInstant(null)).toBe('');
    expect(formatInstant('no es fecha')).toBe('');
  });

  it('sectionLabel y yearStatus', () => {
    expect(sectionLabel(3, 'A')).toBe('3.º A');
    expect(yearStatus({ isActive: true, closedAt: null, readOnly: false }).label).toBe('Activo');
    expect(
      yearStatus({ isActive: false, closedAt: '2025-12-31T00:00:00Z', readOnly: true }).label,
    ).toBe('Cerrado');
    expect(yearStatus({ isActive: false, closedAt: null, readOnly: true }).label).toBe('Inactivo');
    expect(yearStatus({ isActive: false, closedAt: null, readOnly: false }).label).toBe(
      'En preparación',
    );
  });
});
