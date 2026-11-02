import { describe, expect, it } from 'vitest';
import { isNeEligible, isOverdue, resolveEffectiveEntry } from './effective-entry';
import { GradingError } from './errors';

const dueAt = new Date('2026-05-10T23:59:00.000Z');
const before = new Date('2026-05-10T12:00:00.000Z');
const after = new Date('2026-05-11T00:00:00.000Z');

describe('isOverdue', () => {
  it('RF-44: vence solo después de dueAt; en dueAt exacto aún está a tiempo', () => {
    expect(isOverdue(dueAt, before)).toBe(false);
    expect(isOverdue(dueAt, new Date(dueAt.getTime()))).toBe(false);
    expect(isOverdue(dueAt, after)).toBe(true);
  });

  it('RF-44: rechaza fechas inválidas con INVALID_INPUT', () => {
    expect(() => isOverdue(new Date('x'), after)).toThrow(GradingError);
    expect(() => isOverdue(dueAt, 'hoy' as unknown as Date)).toThrow(/now/);
  });
});

describe('resolveEffectiveEntry', () => {
  it('RF-41/A4: GRADED guardada se normaliza a 2 decimales', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'GRADED', value: '05' },
        hasSubmission: true,
        dueAt,
        now: after,
      }),
    ).toEqual({ state: 'GRADED', value: '5.00', virtual: false, needsRegrade: false });
  });

  it('RF-44 (A2): sin nota, sin entrega y vencida devuelve NE virtual con la nota NE de la tarea', () => {
    expect(
      resolveEffectiveEntry({ hasSubmission: false, dueAt, now: after, noSubmissionGrade: 5 }),
    ).toEqual({ state: 'NE', value: '5.00', virtual: true, needsRegrade: false });
  });

  it('RN-05: la NE virtual usa 0.00 si la tarea no configura nota NE', () => {
    const entry = resolveEffectiveEntry({
      grade: null,
      hasSubmission: false,
      dueAt,
      now: after,
      noSubmissionGrade: null,
    });
    expect(entry.value).toBe('0.00');
    expect(entry.virtual).toBe(true);
  });

  it('RF-44: antes del vencimiento no hay NE', () => {
    expect(resolveEffectiveEntry({ hasSubmission: false, dueAt, now: before })).toEqual({
      state: null,
      value: null,
      virtual: false,
      needsRegrade: false,
    });
  });

  it('RF-44: con entrega y sin nota queda sin nota (por calificar), aunque haya vencido', () => {
    expect(resolveEffectiveEntry({ hasSubmission: true, dueAt, now: after }).state).toBeNull();
  });

  it('RF-44: sin NE virtual si la matrícula no era elegible al vencer', () => {
    expect(
      resolveEffectiveEntry({ hasSubmission: false, dueAt, now: after, neEligible: false }).state,
    ).toBeNull();
  });

  it('RF-45: NE guardada con entrega posterior pide recalificar', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'NE', value: '0' },
        hasSubmission: true,
        dueAt,
        now: after,
      }),
    ).toEqual({ state: 'NE', value: '0.00', virtual: false, needsRegrade: true });
  });

  it('RF-45: NE guardada sin entrega no pide recalificar y manda sobre la virtual', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'NE', value: '8.5' },
        hasSubmission: false,
        dueAt,
        now: after,
        noSubmissionGrade: '3',
      }),
    ).toEqual({ state: 'NE', value: '8.50', virtual: false, needsRegrade: false });
  });

  it('RN-07: EXEMPT guardada no lleva valor', () => {
    expect(
      resolveEffectiveEntry({
        grade: { state: 'EXEMPT' },
        hasSubmission: false,
        dueAt,
        now: after,
      }),
    ).toEqual({ state: 'EXEMPT', value: null, virtual: false, needsRegrade: false });
  });

  it('RN-01: una nota guardada inválida lanza INVALID_GRADE', () => {
    expect(() =>
      resolveEffectiveEntry({
        grade: { state: 'GRADED', value: '21' },
        hasSubmission: true,
        dueAt,
        now: after,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_GRADE' }));
  });

  it('RN-07: un estado desconocido lanza INVALID_STATE', () => {
    expect(() =>
      resolveEffectiveEntry({
        grade: { state: 'LATE' } as never,
        hasSubmission: true,
        dueAt,
        now: after,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  });
});

describe('isNeEligible', () => {
  const from = new Date('2026-03-01T00:00:00.000Z');
  const to = new Date('2026-06-01T00:00:00.000Z');

  it('RF-44: matrícula vigente (sin effectiveTo) desde antes del vencimiento es elegible', () => {
    expect(isNeEligible({ effectiveFrom: from, effectiveTo: null }, dueAt)).toBe(true);
    expect(isNeEligible({ effectiveFrom: from }, dueAt)).toBe(true);
  });

  it('RF-44: matrícula que empieza después del vencimiento no es elegible', () => {
    expect(isNeEligible({ effectiveFrom: after }, dueAt)).toBe(false);
  });

  it('RF-44: matrícula cerrada antes del vencimiento no es elegible', () => {
    expect(isNeEligible({ effectiveFrom: from, effectiveTo: before }, dueAt)).toBe(false);
    expect(isNeEligible({ effectiveFrom: from, effectiveTo: to }, dueAt)).toBe(true);
  });

  it('RF-44: traslado en el mismo instante del vencimiento le toca solo a la nueva matrícula', () => {
    expect(isNeEligible({ effectiveFrom: from, effectiveTo: dueAt }, dueAt)).toBe(false);
    expect(isNeEligible({ effectiveFrom: dueAt, effectiveTo: null }, dueAt)).toBe(true);
  });

  it('RF-44: fechas inválidas lanzan INVALID_INPUT', () => {
    expect(() => isNeEligible({ effectiveFrom: new Date('x') }, dueAt)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => isNeEligible({ effectiveFrom: from, effectiveTo: new Date('x') }, dueAt)).toThrow(
      /effectiveTo/,
    );
  });
});
