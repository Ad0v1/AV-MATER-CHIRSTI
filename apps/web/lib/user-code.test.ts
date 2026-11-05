import { describe, expect, it } from 'vitest';
import { isValidUserCode, luhnCheckDigit } from './user-code';

describe('luhnCheckDigit', () => {
  it('calcula el digito de control del ejemplo clasico', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
  });
});

describe('isValidUserCode', () => {
  it('acepta un codigo con el digito de control correcto', () => {
    expect(isValidUserCode('2600000000')).toBe(true);
  });

  it('rechaza un digito cambiado y longitudes o caracteres invalidos', () => {
    expect(isValidUserCode('2600000001')).toBe(false);
    expect(isValidUserCode('260000000')).toBe(false);
    expect(isValidUserCode('26000000000')).toBe(false);
    expect(isValidUserCode('26000000a0')).toBe(false);
    expect(isValidUserCode('')).toBe(false);
  });

  it('coincide con un codigo generado por la API (mismo algoritmo)', () => {
    const body = '271234567';
    expect(isValidUserCode(body + luhnCheckDigit(body))).toBe(true);
  });
});
