import {
  currentPeriodOf,
  isYearReadOnly,
  periodKindFor,
  PERIOD_LABELS,
  shiftDateToYear,
  todayInLima,
  validatePeriodDates,
} from './academic-policy.js';

const periods = (year: number) => [
  { sequence: 1, startDate: `${year}-03-01`, endDate: `${year}-04-30` },
  { sequence: 2, startDate: `${year}-05-01`, endDate: `${year}-06-30` },
  { sequence: 3, startDate: `${year}-07-01`, endDate: `${year}-09-30` },
  { sequence: 4, startDate: `${year}-10-01`, endDate: `${year}-12-31` },
];

describe('validatePeriodDates', () => {
  it('RF-09: acepta 4 períodos ordenados dentro del año', () => {
    expect(validatePeriodDates(2026, periods(2026))).toEqual([]);
  });

  it('RF-09: permite huecos entre períodos', () => {
    const ps = periods(2026);
    ps[1] = { ...ps[1], startDate: '2026-05-15' };
    expect(validatePeriodDates(2026, ps)).toEqual([]);
  });

  it('RF-09: acepta un período de un solo día', () => {
    const ps = periods(2026);
    ps[0] = { ...ps[0], startDate: '2026-04-30' };
    expect(validatePeriodDates(2026, ps)).toEqual([]);
  });

  it('RF-09: rechaza fin anterior al inicio', () => {
    const ps = periods(2026);
    ps[0] = { ...ps[0], endDate: '2026-02-01' };
    expect(validatePeriodDates(2026, ps)).toContainEqual({
      path: 'periods.1',
      message: 'La fecha de fin es anterior a la de inicio',
    });
  });

  it('RF-09: rechaza fechas fuera del año calendario', () => {
    const ps = periods(2026);
    ps[3] = { ...ps[3], endDate: '2027-01-15' };
    expect(validatePeriodDates(2026, ps)).toEqual([
      { path: 'periods.4', message: 'Las fechas deben estar dentro del año 2026' },
    ]);
  });

  it('RF-09: rechaza solapes (el inicio debe ser posterior al fin del anterior)', () => {
    const ps = periods(2026);
    ps[2] = { ...ps[2], startDate: '2026-06-30' };
    expect(validatePeriodDates(2026, ps)).toEqual([
      { path: 'periods.3', message: 'El período se solapa con el anterior' },
    ]);
  });

  it('RF-09: ordena por secuencia antes de comparar', () => {
    expect(validatePeriodDates(2026, [...periods(2026)].reverse())).toEqual([]);
  });

  it('RF-09: rechaza días inexistentes', () => {
    const ps = periods(2026);
    ps[0] = { ...ps[0], startDate: '2026-02-30' };
    expect(validatePeriodDates(2026, ps)).toEqual([
      { path: 'periods.1', message: 'La fecha no es válida' },
    ]);
  });
});

describe('isYearReadOnly (D-030)', () => {
  const active = { year: 2026 };

  it('RF-17: un año cerrado es de solo lectura, aunque sea el activo', () => {
    expect(isYearReadOnly({ year: 2026, isActive: true, closedAt: new Date() }, active)).toBe(true);
  });

  it('RF-17: un año no activo anterior al activo es de solo lectura', () => {
    expect(isYearReadOnly({ year: 2025, isActive: null, closedAt: null }, active)).toBe(true);
  });

  it('RF-17: el año activo sin cerrar es editable', () => {
    expect(isYearReadOnly({ year: 2026, isActive: true, closedAt: null }, active)).toBe(false);
  });

  it('RF-15: un año futuro no cerrado se puede preparar', () => {
    expect(isYearReadOnly({ year: 2027, isActive: null, closedAt: null }, active)).toBe(false);
  });

  it('RF-17: sin año activo, solo los cerrados son de solo lectura', () => {
    expect(isYearReadOnly({ year: 2020, isActive: null, closedAt: null }, null)).toBe(false);
  });
});

describe('períodos (D-002)', () => {
  it('RF-09: deriva tipo y nombre de la secuencia', () => {
    expect(periodKindFor(1)).toBe('FIRST_BIMESTER');
    expect(periodKindFor(4)).toBe('FOURTH_TRIMESTER');
    expect(PERIOD_LABELS[periodKindFor(3)]).toBe('III Trimestre');
  });

  it('RF-09: rechaza secuencias fuera de 1..4', () => {
    expect(() => periodKindFor(5)).toThrow(RangeError);
  });

  it('cambia el año de una fecha y detecta el 29 de febrero inexistente', () => {
    expect(shiftDateToYear('2026-03-01', 2027)).toBe('2027-03-01');
    expect(shiftDateToYear('2028-02-29', 2027)).toBeNull();
  });

  it('usa la fecha de America/Lima (UTC-5)', () => {
    expect(todayInLima(new Date('2026-05-01T03:00:00Z'))).toBe('2026-04-30');
    expect(todayInLima(new Date('2026-05-01T06:00:00Z'))).toBe('2026-05-01');
  });

  it('encuentra el período en curso o null en un hueco', () => {
    const ps = [
      { startDate: '2026-03-01', endDate: '2026-04-30' },
      { startDate: '2026-05-15', endDate: '2026-06-30' },
    ];
    expect(currentPeriodOf(ps, '2026-04-30')).toBe(ps[0]);
    expect(currentPeriodOf(ps, '2026-05-10')).toBeNull();
  });
});
