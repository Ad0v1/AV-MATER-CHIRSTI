import { describe, expect, it } from 'vitest';
import {
  averageText,
  buildGradeInput,
  cellText,
  gradeErrorMessage,
  isUuid,
  literalLabel,
  parseGradeText,
} from './grading-format';

const base = { value: '', comment: '', exemptionReason: '' };

describe('grading-format', () => {
  it('RF-48/D-026: promedio con literal o "Sin notas", nunca 0', () => {
    expect(averageText({ status: 'OK', rounded: 15, literal: 'A', counted: 2, exempt: 0 })).toBe(
      '15 · A (logro esperado)',
    );
    expect(averageText({ status: 'NO_GRADES', counted: 0, exempt: 1 })).toBe('Sin notas');
    expect(literalLabel('X')).toBe('X');
  });

  it('RF-47: celdas con texto para cada estado', () => {
    const g = { virtual: false, needsRegrade: false };
    expect(cellText({ ...g, state: 'GRADED', value: '15.00' })).toBe('15.00');
    expect(cellText({ ...g, state: 'NE', value: '0.00' })).toBe('NE 0.00');
    expect(cellText({ ...g, state: 'EXEMPT', value: null })).toBe('Exonerado');
    expect(cellText({ ...g, state: null, value: null })).toBe('—');
  });

  it('RF-41/RN-01: nota 0..20 con hasta 2 decimales y coma decimal', () => {
    expect(parseGradeText('05')).toBe('05');
    expect(parseGradeText('13,5')).toBe('13.5');
    expect(parseGradeText('20.01')).toBeNull();
    expect(parseGradeText('21')).toBeNull();
    expect(parseGradeText('1.234')).toBeNull();
    expect(parseGradeText('abc')).toBeNull();
  });

  it('RF-41/RF-42: GRADED exige nota; comentario opcional hasta 2000', () => {
    expect(buildGradeInput({ ...base, state: 'GRADED' })).toEqual({
      ok: false,
      errors: { value: 'Escribe la nota (0 a 20).' },
    });
    expect(buildGradeInput({ ...base, state: 'GRADED', value: '18', comment: ' Bien ' })).toEqual({
      ok: true,
      body: { state: 'GRADED', value: '18', comment: 'Bien' },
    });
    const long = buildGradeInput({
      ...base,
      state: 'GRADED',
      value: '18',
      comment: 'a'.repeat(2001),
    });
    expect(long.ok).toBe(false);
  });

  it('RF-45/RN-05: NE sin nota usa la de la tarea', () => {
    expect(buildGradeInput({ ...base, state: 'NE' })).toEqual({ ok: true, body: { state: 'NE' } });
    expect(buildGradeInput({ ...base, state: 'NE', value: '2,5' })).toEqual({
      ok: true,
      body: { state: 'NE', value: '2.5' },
    });
    expect(buildGradeInput({ ...base, state: 'NE', value: '30' }).ok).toBe(false);
  });

  it('RF-46: exonerar exige motivo de 10 a 500 caracteres', () => {
    expect(buildGradeInput({ ...base, state: 'EXEMPT', exemptionReason: 'corto' }).ok).toBe(false);
    expect(
      buildGradeInput({
        ...base,
        state: 'EXEMPT',
        exemptionReason: '  Viaje familiar autorizado ',
      }),
    ).toEqual({
      ok: true,
      body: { state: 'EXEMPT', exemptionReason: 'Viaje familiar autorizado' },
    });
    expect(buildGradeInput({ ...base, state: 'EXEMPT', exemptionReason: 'a'.repeat(501) }).ok).toBe(
      false,
    );
  });

  it('RF-41: traduce los 422 por code', () => {
    expect(gradeErrorMessage('NO_SUBMISSION')).toMatch(/entregada/);
    expect(gradeErrorMessage('ENROLLMENT_NOT_ELIGIBLE')).toMatch(/matriculado/);
    expect(gradeErrorMessage('OTRO')).toBeUndefined();
    expect(gradeErrorMessage(undefined)).toBeUndefined();
    expect(isUuid('00000000-0000-7000-8000-000000000000')).toBe(true);
    expect(isUuid('x')).toBe(false);
  });
});
