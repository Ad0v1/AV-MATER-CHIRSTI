import { describe, expect, it } from 'vitest';
import { GradingError } from './errors';
import {
  DEFAULT_NO_SUBMISSION_GRADE,
  formatGrade,
  isValidGrade,
  parseGrade,
  resolveNoSubmissionGrade,
} from './grade-value';

describe('parseGrade / isValidGrade', () => {
  it('RN-01: acepta los bordes 0 y 20', () => {
    expect(parseGrade('0')).toBe(0);
    expect(parseGrade('20')).toBe(2000);
    expect(parseGrade(20)).toBe(2000);
    expect(parseGrade('20.00')).toBe(2000);
  });

  it('RN-01: convierte a centésimas enteras sin coma flotante', () => {
    expect(parseGrade('13.5')).toBe(1350);
    expect(parseGrade('13.50')).toBe(1350);
    expect(parseGrade('0.01')).toBe(1);
    expect(parseGrade(17.49)).toBe(1749);
  });

  it('RN-01: rechaza valores fuera de 0..20', () => {
    for (const value of ['20.01', '21', -1, '-0.5', 100]) {
      expect(() => parseGrade(value)).toThrow(GradingError);
      expect(isValidGrade(value)).toBe(false);
    }
  });

  it('RN-01: rechaza más de 2 decimales y formatos no numéricos', () => {
    for (const value of [
      '13.555',
      '',
      ' 13',
      'abc',
      '1e1',
      '13.',
      '.5',
      NaN,
      Infinity,
      0.1 + 0.2,
    ]) {
      expect(isValidGrade(value)).toBe(false);
    }
    expect(isValidGrade(null)).toBe(false);
    expect(isValidGrade(undefined)).toBe(false);
  });

  it('RN-01: el error tiene código INVALID_GRADE', () => {
    try {
      parseGrade('21');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GradingError);
      expect((error as GradingError).code).toBe('INVALID_GRADE');
    }
  });
});

describe('formatGrade', () => {
  it('RN-01: normaliza a 2 decimales', () => {
    expect(formatGrade(13.5)).toBe('13.50');
    expect(formatGrade('7')).toBe('7.00');
    expect(formatGrade('0.1')).toBe('0.10');
    expect(formatGrade('20')).toBe('20.00');
  });
});

describe('resolveNoSubmissionGrade', () => {
  it('RN-05: sin configuración la nota NE es 0', () => {
    expect(DEFAULT_NO_SUBMISSION_GRADE).toBe('0.00');
    expect(resolveNoSubmissionGrade()).toBe('0.00');
    expect(resolveNoSubmissionGrade(null)).toBe('0.00');
  });

  it('RN-05: respeta la nota NE configurada en la tarea', () => {
    expect(resolveNoSubmissionGrade('5')).toBe('5.00');
    expect(resolveNoSubmissionGrade(10.5)).toBe('10.50');
  });

  it('RN-05: la nota NE configurada también debe estar en 0..20', () => {
    expect(() => resolveNoSubmissionGrade('21')).toThrow(GradingError);
    expect(() => resolveNoSubmissionGrade(-1)).toThrow(GradingError);
  });
});

describe('parseGrade: bordes de formato', () => {
  it('RN-01: 20.00 es válido y 20.01 no', () => {
    expect(parseGrade('20.00')).toBe(2000);
    expect(parseGrade('20.0')).toBe(2000);
    expect(() => parseGrade('20.01')).toThrow(GradingError);
    expect(() => parseGrade(20.01)).toThrow(GradingError);
    expect(() => parseGrade('20.1')).toThrow(GradingError);
  });

  it('RN-01: ceros a la izquierda y decimales cortos se normalizan', () => {
    expect(parseGrade('00.5')).toBe(50);
    expect(parseGrade('05')).toBe(500);
    expect(parseGrade('5.0')).toBe(500);
    expect(parseGrade('5.00')).toBe(500);
    expect(parseGrade('0.50')).toBe(50);
    expect(parseGrade('0')).toBe(0);
    expect(parseGrade('0.00')).toBe(0);
  });

  it('RN-01: number con 2 decimales se lee exacto', () => {
    expect(parseGrade(13.45)).toBe(1345);
    expect(parseGrade(0.07)).toBe(7);
    expect(parseGrade(19.99)).toBe(1999);
    expect(parseGrade(0.5)).toBe(50);
    expect(parseGrade(0)).toBe(0);
  });

  it('RN-01: -0 como number es 0; como texto se rechaza', () => {
    expect(Object.is(parseGrade(-0), 0)).toBe(true);
    expect(() => parseGrade('-0')).toThrow(GradingError);
    expect(() => parseGrade('-0.00')).toThrow(GradingError);
  });

  it('RN-01: rechaza "13.", ".5", más de 2 enteros, signos, separadores y notación científica', () => {
    for (const value of [
      '13.',
      '.5',
      '.',
      '100',
      '020',
      '+5',
      '1,5',
      '1 5',
      '5 ',
      '0x10',
      '1e1',
      '13.505',
      '5\n',
      1e21,
      1e-7,
      0.001,
      -0.01,
    ]) {
      expect(() => parseGrade(value), String(value)).toThrow(GradingError);
      expect(isValidGrade(value), String(value)).toBe(false);
    }
  });

  it('RN-01: tipos no admitidos se rechazan sin lanzar en isValidGrade', () => {
    for (const value of [null, undefined, {}, [], true, 10n, () => 1]) {
      expect(isValidGrade(value)).toBe(false);
    }
    expect(() => parseGrade(null as unknown as string)).toThrow(GradingError);
    expect(() => parseGrade(undefined as unknown as string)).toThrow(GradingError);
  });

  it('RN-01: todas las centésimas 0..2000 hacen ida y vuelta exacta', () => {
    for (let cents = 0; cents <= 2000; cents++) {
      const text = formatGrade(cents / 100);
      expect(parseGrade(text)).toBe(cents);
      expect(parseGrade(cents / 100)).toBe(cents);
    }
  });
});

describe('formatGrade / resolveNoSubmissionGrade: bordes', () => {
  it('RN-01: formatea bordes y descarta ceros a la izquierda', () => {
    expect(formatGrade('0')).toBe('0.00');
    expect(formatGrade('00.5')).toBe('0.50');
    expect(formatGrade('05')).toBe('5.00');
    expect(formatGrade(20)).toBe('20.00');
    expect(formatGrade(-0)).toBe('0.00');
    expect(formatGrade(0.07)).toBe('0.07');
  });

  it('RN-05: NE configurada 0 y 20 son válidas; "0" no se confunde con sin configurar', () => {
    expect(resolveNoSubmissionGrade(0)).toBe('0.00');
    expect(resolveNoSubmissionGrade('0')).toBe('0.00');
    expect(resolveNoSubmissionGrade(20)).toBe('20.00');
    expect(resolveNoSubmissionGrade('20.00')).toBe('20.00');
    expect(() => resolveNoSubmissionGrade('20.01')).toThrow(GradingError);
    expect(() => resolveNoSubmissionGrade('')).toThrow(GradingError);
  });
});
