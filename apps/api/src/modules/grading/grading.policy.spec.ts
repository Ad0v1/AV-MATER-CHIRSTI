import { describe, expect, it } from 'vitest';
import { gradeInputSchema } from './grading.dto.js';
import {
  auditState,
  changedFields,
  decideManualGrade,
  decimalText,
  toGradeEntry,
  type GradeRow,
  type ManualGradeContext,
} from './grading.policy.js';

const dueAt = new Date('2026-05-10T23:59:00.000Z');
const after = new Date('2026-05-11T10:00:00.000Z');
const before = new Date('2026-05-09T10:00:00.000Z');
const enrollment = {
  isCurrent: true,
  effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
  effectiveTo: null,
};

const ctx = (over: Partial<ManualGradeContext>): ManualGradeContext => ({
  input: { state: 'GRADED', value: '15.00', comment: null },
  hasSubmission: true,
  dueAt,
  now: after,
  noSubmissionGrade: '0.00',
  enrollment,
  ...over,
});

const row = (over: Partial<GradeRow> = {}): GradeRow => ({
  state: 'GRADED',
  value: '15.00',
  comment: null,
  exemptionReason: null,
  source: 'MANUAL',
  ...over,
});

describe('gradeInputSchema', () => {
  it('RF-41/A4: normaliza "05" → "5.00" con el motor', () => {
    expect(gradeInputSchema.parse({ state: 'GRADED', value: '05' })).toEqual({
      state: 'GRADED',
      value: '5.00',
      comment: null,
    });
  });

  it('RF-46: motivo corto da un issue en exemptionReason', () => {
    const r = gradeInputSchema.safeParse({ state: 'EXEMPT', exemptionReason: 'corto' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['exemptionReason']);
  });

  it('RF-41: cuerpo que no es objeto da un issue sin ruta', () => {
    const r = gradeInputSchema.safeParse(null);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual([]);
  });
});

describe('decideManualGrade (A1)', () => {
  it('RF-41: GRADED con entrega queda MANUAL', () => {
    expect(decideManualGrade(ctx({}))).toEqual({ ok: true, row: row() });
  });

  it('RF-41: GRADED sin entrega es NO_SUBMISSION', () => {
    expect(decideManualGrade(ctx({ hasSubmission: false }))).toMatchObject({
      ok: false,
      code: 'NO_SUBMISSION',
    });
  });

  it('RF-45/RN-05: NE manual sin value usa la nota NE de la tarea', () => {
    expect(
      decideManualGrade(
        ctx({
          input: { state: 'NE', value: null, comment: 'x' },
          hasSubmission: false,
          noSubmissionGrade: '5.00',
        }),
      ),
    ).toEqual({ ok: true, row: row({ state: 'NE', value: '5.00', comment: 'x' }) });
  });

  it('RF-45: NE manual con valor propio', () => {
    expect(
      decideManualGrade(
        ctx({ input: { state: 'NE', value: '3.00', comment: null }, hasSubmission: false }),
      ),
    ).toMatchObject({ ok: true, row: { state: 'NE', value: '3.00' } });
  });

  it('RF-45: NE con entrega es HAS_SUBMISSION; antes del plazo NOT_OVERDUE', () => {
    const ne = { state: 'NE' as const, value: null, comment: null };
    expect(decideManualGrade(ctx({ input: ne }))).toMatchObject({ code: 'HAS_SUBMISSION' });
    expect(decideManualGrade(ctx({ input: ne, hasSubmission: false, now: before }))).toMatchObject({
      code: 'NOT_OVERDUE',
    });
  });

  it('RN-14: NE en matrícula no vigente al vencer es ENROLLMENT_NOT_ELIGIBLE', () => {
    expect(
      decideManualGrade(
        ctx({
          input: { state: 'NE', value: null, comment: null },
          hasSubmission: false,
          enrollment: { isCurrent: true, effectiveFrom: after, effectiveTo: null },
        }),
      ),
    ).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE' });
  });

  it('RF-46/RN-07: EXEMPT sin valor y con motivo; matrícula cerrada no elegible se rechaza', () => {
    const input = {
      state: 'EXEMPT' as const,
      exemptionReason: 'Certificado médico',
      comment: null,
    };
    expect(decideManualGrade(ctx({ input }))).toEqual({
      ok: true,
      row: row({ state: 'EXEMPT', value: null, exemptionReason: 'Certificado médico' }),
    });
    expect(
      decideManualGrade(
        ctx({
          input,
          enrollment: {
            isCurrent: false,
            effectiveFrom: enrollment.effectiveFrom,
            effectiveTo: before,
          },
        }),
      ),
    ).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE' });
  });
});

describe('changedFields y bitácora (U3)', () => {
  it('RF-41: sin fila previa, los campos no nulos', () => {
    expect(changedFields(null, row({ comment: 'bien' }))).toEqual([
      'state',
      'value',
      'comment',
      'source',
    ]);
  });

  it('RF-45: NE AUTO → GRADED MANUAL cambia estado, valor y origen', () => {
    expect(changedFields(row({ state: 'NE', value: '0.00', source: 'AUTO' }), row())).toEqual([
      'state',
      'value',
      'source',
    ]);
  });

  it('A4: "15" y "15.00" son la misma nota; sin cambios da lista vacía', () => {
    expect(changedFields(row({ value: '15' }), row())).toEqual([]);
  });

  it('U2/U3: la bitácora solo lleva state, value y source', () => {
    expect(
      auditState(row({ state: 'EXEMPT', value: null, exemptionReason: 'secreto', comment: 'c' })),
    ).toEqual({ state: 'EXEMPT', value: null, source: 'MANUAL' });
  });

  it('RN-07: toGradeEntry y decimalText', () => {
    expect(toGradeEntry({ state: 'EXEMPT', value: null })).toEqual({ state: 'EXEMPT' });
    expect(toGradeEntry({ state: 'NE', value: '2.50' })).toEqual({ state: 'NE', value: '2.50' });
    expect(decimalText(null)).toBeNull();
    expect(decimalText({ toFixed: (d: number) => (5).toFixed(d) })).toBe('5.00');
  });
});
