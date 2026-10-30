import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, resolveTimeoutMs } from './request-guards';

describe('resolveTimeoutMs (tiempo máximo por petición)', () => {
  it('15 s por defecto', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
    expect(resolveTimeoutMs()).toBe(15_000);
  });

  it('acepta enteros entre 1 s y 60 s (la promoción usa 30 s)', () => {
    expect(resolveTimeoutMs(30_000)).toBe(30_000);
    expect(resolveTimeoutMs(1_000)).toBe(1_000);
    expect(resolveTimeoutMs(MAX_TIMEOUT_MS)).toBe(60_000);
  });

  it('valores fuera de rango o no enteros vuelven a 15 s', () => {
    for (const v of [0, 999, 60_001, 1.5e4 + 0.5, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(resolveTimeoutMs(v)).toBe(15_000);
    }
  });
});
