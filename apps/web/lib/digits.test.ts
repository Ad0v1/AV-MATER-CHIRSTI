import { describe, expect, it } from 'vitest';
import { onlyDecimal, onlyDigits } from './digits';

describe('onlyDigits', () => {
  it('descarta letras, símbolos y espacios', () => {
    expect(onlyDigits('20a26')).toBe('2026');
    expect(onlyDigits("1' OR '1'='1")).toBe('111');
    expect(onlyDigits('12 34-56')).toBe('123456');
    expect(onlyDigits('<script>')).toBe('');
  });

  it('recorta al máximo', () => {
    expect(onlyDigits('123456789', 8)).toBe('12345678');
  });

  it('descarta dígitos no latinos', () => {
    expect(onlyDigits('٢٠٢٦')).toBe('');
  });
});

describe('onlyDecimal', () => {
  it('permite un separador y limita los decimales', () => {
    expect(onlyDecimal('13,5')).toBe('13,5');
    expect(onlyDecimal('13.567')).toBe('13.56');
    expect(onlyDecimal('1a2.3.4')).toBe('12.34');
  });

  it('no admite signo, exponente ni texto', () => {
    expect(onlyDecimal('-5')).toBe('5');
    expect(onlyDecimal('1e3')).toBe('13');
    expect(onlyDecimal('abc')).toBe('');
  });
});
