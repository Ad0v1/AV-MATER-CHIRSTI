import { describe, expect, it } from 'vitest';
import {
  EXEMPTION_REASON_MAX,
  EXEMPTION_REASON_MIN,
  GRADE_COMMENT_MAX,
  normalizeGradeInput,
} from './grade-input';

const paths = (body: unknown): string[] => {
  const result = normalizeGradeInput(body);
  return result.ok ? [] : result.issues.map((i) => i.path);
};

describe('normalizeGradeInput', () => {
  it('RF-41/A4: GRADED normaliza la nota ("05" → "5.00", 13.5 → "13.50")', () => {
    expect(normalizeGradeInput({ state: 'GRADED', value: '05' })).toEqual({
      ok: true,
      data: { state: 'GRADED', value: '5.00', literal: null, comment: null },
    });
    expect(normalizeGradeInput({ state: 'GRADED', value: 13.5 })).toMatchObject({
      ok: true,
      data: { value: '13.50' },
    });
  });

  it('RF-41/RN-01: GRADED exige nota válida 0..20 con hasta 2 decimales', () => {
    expect(paths({ state: 'GRADED' })).toEqual(['value']);
    expect(paths({ state: 'GRADED', value: null })).toEqual(['value']);
    expect(paths({ state: 'GRADED', value: '20.01' })).toEqual(['value']);
    expect(paths({ state: 'GRADED', value: '-1' })).toEqual(['value']);
    expect(paths({ state: 'GRADED', value: '10.123' })).toEqual(['value']);
    expect(paths({ state: 'GRADED', value: true })).toEqual(['value']);
  });

  it('RF-42: comentario opcional de hasta 2000 caracteres; vacío pasa a null', () => {
    const ok = normalizeGradeInput({
      state: 'GRADED',
      value: '15',
      comment: `  ${'a'.repeat(GRADE_COMMENT_MAX)}  `,
    });
    expect(ok.ok && ok.data.comment?.length).toBe(GRADE_COMMENT_MAX);
    expect(normalizeGradeInput({ state: 'GRADED', value: '15', comment: '   ' })).toMatchObject({
      ok: true,
      data: { comment: null },
    });
    expect(
      paths({ state: 'GRADED', value: '15', comment: 'a'.repeat(GRADE_COMMENT_MAX + 1) }),
    ).toEqual(['comment']);
    expect(paths({ state: 'GRADED', value: '15', comment: 5 })).toEqual(['comment']);
  });

  it('RF-45/RN-05: NE con nota opcional; sin nota queda null para usar la de la tarea', () => {
    expect(normalizeGradeInput({ state: 'NE' })).toEqual({
      ok: true,
      data: { state: 'NE', value: null, literal: null, comment: null },
    });
    expect(normalizeGradeInput({ state: 'NE', value: '7', comment: 'No entregó' })).toEqual({
      ok: true,
      data: { state: 'NE', value: '7.00', literal: null, comment: 'No entregó' },
    });
    expect(paths({ state: 'NE', value: '25' })).toEqual(['value']);
  });

  it('RF-46/RN-07: EXEMPT exige motivo de 10 a 500 caracteres y no lleva nota', () => {
    expect(
      normalizeGradeInput({ state: 'EXEMPT', exemptionReason: '  Certificado médico  ' }),
    ).toEqual({
      ok: true,
      data: { state: 'EXEMPT', exemptionReason: 'Certificado médico', comment: null },
    });
    expect(paths({ state: 'EXEMPT' })).toEqual(['exemptionReason']);
    expect(
      paths({ state: 'EXEMPT', exemptionReason: 'a'.repeat(EXEMPTION_REASON_MIN - 1) }),
    ).toEqual(['exemptionReason']);
    expect(
      paths({ state: 'EXEMPT', exemptionReason: 'a'.repeat(EXEMPTION_REASON_MAX + 1) }),
    ).toEqual(['exemptionReason']);
    expect(paths({ state: 'EXEMPT', exemptionReason: 'a'.repeat(EXEMPTION_REASON_MAX) })).toEqual(
      [],
    );
    expect(paths({ state: 'EXEMPT', value: '10', exemptionReason: 'Motivo suficiente' })).toEqual([
      'value',
    ]);
  });

  it('RF-46: solo la exoneración lleva motivo', () => {
    expect(paths({ state: 'GRADED', value: '10', exemptionReason: 'Motivo suficiente' })).toEqual([
      'exemptionReason',
    ]);
  });

  it('RF-41: rechaza cuerpos que no son objeto o con state desconocido', () => {
    expect(paths(null)).toEqual(['']);
    expect(paths([])).toEqual(['']);
    expect(paths('GRADED')).toEqual(['']);
    expect(paths({ state: 'LATE', value: '10' })).toEqual(['state']);
    expect(paths({ value: '10' })).toEqual(['state']);
  });

  it('RF-41: ignora campos desconocidos', () => {
    expect(normalizeGradeInput({ state: 'GRADED', value: '10', source: 'AUTO' })).toEqual({
      ok: true,
      data: { state: 'GRADED', value: '10.00', literal: null, comment: null },
    });
  });
});
