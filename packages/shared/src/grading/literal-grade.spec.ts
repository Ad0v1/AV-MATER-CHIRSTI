import { describe, expect, it } from 'vitest';
import { resolveEffectiveEntry } from './effective-entry';
import { GradingError } from './errors';
import { buildGradebook } from './gradebook';
import { checkGradeInputScale, normalizeGradeInput } from './grade-input';
import {
  DEFAULT_NO_SUBMISSION_LITERAL,
  isGradeLiteral,
  resolveNoSubmissionLiteral,
} from './literal-grade';

// Escala literal AD/A/B/C de INICIAL y PRIMARIA (tres niveles, 09/11/2026).
const now = new Date('2026-05-20T12:00:00.000Z');
const past = new Date('2026-05-10T23:59:00.000Z');
const future = new Date('2026-05-30T23:59:00.000Z');
const start = new Date('2026-03-01T00:00:00.000Z');
const LIT = 'LITERAL_ADABC' as const;

describe('literales', () => {
  it('RN-01: solo AD, A, B y C son literales válidos', () => {
    expect(['AD', 'A', 'B', 'C'].every(isGradeLiteral)).toBe(true);
    expect(isGradeLiteral('D')).toBe(false);
    expect(isGradeLiteral('ad')).toBe(false);
    expect(isGradeLiteral(15)).toBe(false);
  });

  it('RN-05: la NE literal usa el de la tarea y, si no hay, el configurable (null por defecto)', () => {
    expect(DEFAULT_NO_SUBMISSION_LITERAL).toBeNull();
    expect(resolveNoSubmissionLiteral('B')).toBe('B');
    expect(resolveNoSubmissionLiteral(null)).toBeNull();
    expect(resolveNoSubmissionLiteral(null, 'C')).toBe('C');
  });
});

describe('normalizeGradeInput y checkGradeInputScale', () => {
  it('RN-01: acepta literal en GRADED y NE', () => {
    expect(normalizeGradeInput({ state: 'GRADED', literal: 'AD' })).toEqual({
      ok: true,
      data: { state: 'GRADED', value: null, literal: 'AD', comment: null },
    });
    expect(normalizeGradeInput({ state: 'NE', literal: 'C' })).toMatchObject({
      ok: true,
      data: { state: 'NE', value: null, literal: 'C' },
    });
  });

  it('RN-01: rechaza literal inválido, value y literal juntos, y literal en EXEMPT', () => {
    expect(normalizeGradeInput({ state: 'GRADED', literal: 'D' }).ok).toBe(false);
    expect(normalizeGradeInput({ state: 'GRADED', literal: 'A', value: 10 }).ok).toBe(false);
    expect(
      normalizeGradeInput({ state: 'EXEMPT', literal: 'A', exemptionReason: 'Motivo largo ok' }).ok,
    ).toBe(false);
  });

  it('RN-01: el campo debe coincidir con la escala del nivel', () => {
    const lit = normalizeGradeInput({ state: 'GRADED', literal: 'A' });
    const num = normalizeGradeInput({ state: 'GRADED', value: '14' });
    if (!lit.ok || !num.ok) throw new Error('entrada inválida');
    expect(checkGradeInputScale(lit.data, LIT)).toBeNull();
    expect(checkGradeInputScale(num.data, 'NUMERIC_0_20')).toBeNull();
    expect(checkGradeInputScale(lit.data, 'NUMERIC_0_20')?.path).toBe('literal');
    expect(checkGradeInputScale(num.data, LIT)?.path).toBe('value');
  });
});

describe('resolveEffectiveEntry en escala literal', () => {
  it('RN-01: GRADED literal se devuelve sin valor numérico', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'GRADED', literal: 'A' },
        hasSubmission: true,
        dueAt: past,
        now,
        scale: LIT,
      }),
    ).toEqual({ state: 'GRADED', value: null, literal: 'A', virtual: false, needsRegrade: false });
  });

  it('RN-05: NE virtual con el literal de la tarea', () => {
    expect(
      resolveEffectiveEntry({
        hasSubmission: false,
        dueAt: past,
        now,
        scale: LIT,
        noSubmissionLiteral: 'C',
      }),
    ).toMatchObject({ state: 'NE', literal: 'C', value: null, virtual: true });
  });

  it('RN-05: NE virtual sin literal en la tarea queda como NE sin literal', () => {
    expect(
      resolveEffectiveEntry({ hasSubmission: false, dueAt: past, now, scale: LIT }),
    ).toMatchObject({ state: 'NE', literal: null, value: null, virtual: true });
  });

  it('RN-07: EXEMPT en escala literal no lleva valor ni literal', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'EXEMPT' },
        hasSubmission: false,
        dueAt: past,
        now,
        scale: LIT,
      }),
    ).toMatchObject({ state: 'EXEMPT', value: null, literal: null });
  });

  it('RN-01: un literal inválido guardado lanza INVALID_GRADE', () => {
    expect(() =>
      resolveEffectiveEntry({
        grade: { state: 'GRADED', literal: 'X' as 'A' },
        hasSubmission: true,
        dueAt: past,
        now,
        scale: LIT,
      }),
    ).toThrow(GradingError);
  });

  it('RN-06: sin descuento por tardía; NE con entrega posterior pide recalificar', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'NE', literal: 'C' },
        hasSubmission: true,
        dueAt: past,
        now,
        scale: LIT,
      }),
    ).toMatchObject({ state: 'NE', literal: 'C', needsRegrade: true });
  });
});

describe('buildGradebook en escala literal', () => {
  const book = () =>
    buildGradebook({
      gradingScale: LIT,
      assignments: [
        { id: 't1', dueAt: past, noSubmissionLiteral: 'B' },
        { id: 't2', dueAt: past },
        { id: 't3', dueAt: future },
      ],
      students: [
        { enrollmentId: 'e1', effectiveFrom: start, effectiveTo: null },
        { enrollmentId: 'e2', effectiveFrom: start, effectiveTo: null },
        { enrollmentId: 'e3', effectiveFrom: start, effectiveTo: null },
      ],
      cells: [
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', literal: 'AD' },
          submission: { isLate: false },
        },
        { assignmentId: 't2', enrollmentId: 'e1', grade: { state: 'EXEMPT' } },
      ],
      achievements: [
        { enrollmentId: 'e1', literal: 'AD' },
        { enrollmentId: 'e2', literal: 'C' },
      ],
      now,
    });

  it('RN-02/RN-03: no hay promedio aritmético en escala literal', () => {
    const b = book();
    expect(b.rows[0].average).toEqual({ status: 'LITERAL_SCALE', counted: 0, exempt: 1 });
    expect(b.columns[0].average.status).toBe('LITERAL_SCALE');
  });

  it('RN-04: el resumen del período es el logro que elige el docente', () => {
    const b = book();
    expect(b.rows.map((r) => r.achievement)).toEqual(['AD', 'C', null]);
    expect(b.dashboard.distribution).toEqual({ AD: 1, A: 0, B: 0, C: 1 });
    expect(b.dashboard.noGrades).toBe(1);
    expect(b.dashboard.riskLiteral).toBe('C');
    expect(b.dashboard.atRisk).toEqual(['e2']);
  });

  it('RN-05: las celdas muestran literales de apoyo y la NE automática literal', () => {
    const b = book();
    expect(b.rows[0].entries[0]).toMatchObject({ state: 'GRADED', literal: 'AD' });
    expect(b.rows[1].entries[0]).toMatchObject({ state: 'NE', literal: 'B', virtual: true });
    expect(b.rows[1].entries[1]).toMatchObject({ state: 'NE', literal: null, virtual: true });
    expect(b.rows[1].entries[2].state).toBeNull();
    expect(b.dashboard.counts.ne).toBe(4);
  });

  it('RN-04: logro de una matrícula desconocida lanza INVALID_INPUT', () => {
    expect(() =>
      buildGradebook({
        gradingScale: LIT,
        assignments: [],
        students: [],
        cells: [],
        achievements: [{ enrollmentId: 'x', literal: 'A' }],
        now,
      }),
    ).toThrow(GradingError);
  });

  it('RN-02: en escala numérica el logro no aplica y achievement es null', () => {
    const b = buildGradebook({
      assignments: [{ id: 't1', dueAt: past }],
      students: [{ enrollmentId: 'e1', effectiveFrom: start, effectiveTo: null }],
      cells: [],
      now,
    });
    expect(b.rows[0].achievement).toBeNull();
    expect(b.rows[0].average.status).toBe('OK');
  });
});
