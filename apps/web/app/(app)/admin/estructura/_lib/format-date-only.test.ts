import { describe, expect, it } from 'vitest';
import { formatDateOnly } from './format';

describe('formatDateOnly', () => {
  it('da formato legible sin correr el día', () => {
    expect(formatDateOnly('2026-03-01')).toBe('1 mar 2026');
    expect(formatDateOnly('2026-12-31')).toBe('31 dic 2026');
  });

  it('devuelve el texto tal cual si no tiene el formato', () => {
    expect(formatDateOnly('')).toBe('');
    expect(formatDateOnly('2026-13-01')).toBe('2026-13-01');
    expect(formatDateOnly('01/03/2026')).toBe('01/03/2026');
  });
});
