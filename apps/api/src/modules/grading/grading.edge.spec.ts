import { describe, expect, it } from 'vitest';
import { gradeInputSchema } from './grading.dto.js';
import { auditState, changedFields, decideManualGrade } from './grading.policy.js';

// Casos límite de RF-41, RF-42, RF-45, RF-46 y RN-14 que complementan grading.policy.spec.ts.
const dueAt = new Date('2026-05-10T23:59:00.000Z');
const enrollment = {
  isCurrent: true,
  effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
  effectiveTo: null as Date | null,
};
const reason = (n: number) => 'x'.repeat(n);

describe('gradeInputSchema: límites', () => {
  it.each([
    ['0', '0.00'],
    ['20', '20.00'],
    ['20.00', '20.00'],
    ['05', '5.00'],
    ['7.5', '7.50'],
  ])('RN-01: GRADED %s es válida y queda %s', (value, expected) => {
    const r = gradeInputSchema.safeParse({ state: 'GRADED', value });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.value).toBe(expected);
  });

  it.each(['20.01', '21', '-0.01', '-1', 'abc', ''])('RN-01: GRADED %j se rechaza', (value) => {
    expect(gradeInputSchema.safeParse({ state: 'GRADED', value }).success).toBe(false);
  });

  it('RF-41: GRADED sin value se rechaza', () => {
    expect(gradeInputSchema.safeParse({ state: 'GRADED' }).success).toBe(false);
  });

  it('RF-45: NE sin value → null; NE con value se normaliza; NE con value fuera de rango se rechaza', () => {
    expect(gradeInputSchema.parse({ state: 'NE' }).value ?? null).toBeNull();
    expect(gradeInputSchema.parse({ state: 'NE', value: '2.5' }).value).toBe('2.50');
    expect(gradeInputSchema.safeParse({ state: 'NE', value: '20.01' }).success).toBe(false);
  });

  it.each([
    [9, false],
    [10, true],
    [500, true],
    [501, false],
  ])('RF-46: motivo de %i caracteres → válido=%s', (n, ok) => {
    const r = gradeInputSchema.safeParse({ state: 'EXEMPT', exemptionReason: reason(n) });
    expect(r.success).toBe(ok);
  });

  it('RF-46: el motivo se recorta antes de medirlo (9 útiles + espacios se rechaza)', () => {
    const r = gradeInputSchema.safeParse({
      state: 'EXEMPT',
      exemptionReason: `   ${reason(9)}   `,
    });
    expect(r.success).toBe(false);
  });

  it('RF-46: EXEMPT sin motivo o con value se rechaza', () => {
    expect(gradeInputSchema.safeParse({ state: 'EXEMPT' }).success).toBe(false);
    expect(
      gradeInputSchema.safeParse({
        state: 'EXEMPT',
        exemptionReason: reason(20),
        value: '10',
      }).success,
    ).toBe(false);
  });

  it.each([
    [2000, true],
    [2001, false],
  ])('RF-42: comentario de %i caracteres → válido=%s', (n, ok) => {
    expect(
      gradeInputSchema.safeParse({ state: 'GRADED', value: '10', comment: reason(n) }).success,
    ).toBe(ok);
  });
});

describe('decideManualGrade: límites de tiempo y elegibilidad', () => {
  const base = {
    input: { state: 'NE' as const, value: null, comment: null },
    hasSubmission: false,
    dueAt,
    noSubmissionGrade: '0.00',
    enrollment,
  };

  it('RF-45: en el instante exacto de dueAt todavía no está vencida (NOT_OVERDUE)', () => {
    const r = decideManualGrade({ ...base, now: dueAt });
    expect(r).toMatchObject({ ok: false, code: 'NOT_OVERDUE' });
  });

  it('RF-45: un milisegundo después de dueAt la NE manual es válida y queda MANUAL', () => {
    const r = decideManualGrade({ ...base, now: new Date(dueAt.getTime() + 1) });
    expect(r).toMatchObject({ ok: true, row: { state: 'NE', value: '0.00', source: 'MANUAL' } });
  });

  it('RN-14: traslado a mitad de período; effectiveTo == dueAt no es elegible, un ms después sí lo fue', () => {
    const now = new Date(dueAt.getTime() + HOUR);
    const closedAtDue = {
      isCurrent: false,
      effectiveFrom: enrollment.effectiveFrom,
      effectiveTo: dueAt,
    };
    expect(decideManualGrade({ ...base, now, enrollment: closedAtDue })).toMatchObject({
      ok: false,
      code: 'ENROLLMENT_NOT_ELIGIBLE',
    });
    const closedLater = { ...closedAtDue, effectiveTo: new Date(dueAt.getTime() + 1) };
    expect(decideManualGrade({ ...base, now, enrollment: closedLater }).ok).toBe(true);
  });

  it('RF-46: EXEMPT no guarda value y limpia el comentario nulo', () => {
    const r = decideManualGrade({
      ...base,
      hasSubmission: true,
      now: new Date(dueAt.getTime() + HOUR),
      input: { state: 'EXEMPT', exemptionReason: reason(10), comment: null } as never,
    });
    expect(r).toMatchObject({ ok: true, row: { state: 'EXEMPT', value: null, source: 'MANUAL' } });
  });
});

const HOUR = 3_600_000;

describe('bitácora y cambios: privacidad (U2/U3)', () => {
  const exempt = {
    state: 'EXEMPT' as const,
    value: null,
    comment: 'privado',
    exemptionReason: 'motivo privado largo',
    source: 'MANUAL' as const,
  };

  it('U2: auditState de una exoneración no contiene comentario ni motivo', () => {
    const text = JSON.stringify(auditState(exempt));
    expect(text).not.toContain('privado');
    expect(auditState(exempt)).toEqual({ state: 'EXEMPT', value: null, source: 'MANUAL' });
  });

  it('RF-41: cambiar solo el comentario cuenta como cambio; idéntico no', () => {
    const a = { ...exempt, state: 'GRADED' as const, value: '10.00', exemptionReason: null };
    expect(changedFields(a, { ...a, comment: 'otro' })).toEqual(['comment']);
    expect(changedFields(a, { ...a })).toEqual([]);
  });

  it('RF-45: NE AUTO editada pasa a MANUAL aunque el valor no cambie', () => {
    const auto = {
      state: 'NE' as const,
      value: '0.00',
      comment: null,
      exemptionReason: null,
      source: 'AUTO' as const,
    };
    expect(changedFields(auto, { ...auto, source: 'MANUAL' })).toEqual(['source']);
  });
});
