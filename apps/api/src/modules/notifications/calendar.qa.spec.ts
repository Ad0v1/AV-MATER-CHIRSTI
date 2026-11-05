import { describe, expect, it } from 'vitest';
import { calendarQuerySchema, CALENDAR_MAX_DAYS } from './calendar.dto.js';

// QA de 5e (RF-54): formatos de fecha en el límite entre la web y la API.
const ok = (q: unknown) => calendarQuerySchema.safeParse(q).success;

describe('calendarQuerySchema: formatos de fecha (RF-54)', () => {
  it('el rango máximo es de 62 días', () => {
    expect(CALENDAR_MAX_DAYS).toBe(62);
  });

  it('un instante con segundos y zona pasa; con fracción de segundo y offset también', () => {
    expect(ok({ from: '2026-03-01T00:00:00-05:00', to: '2026-03-02T00:00:00.500+00:00' })).toBe(
      true,
    );
  });

  it('un instante inexistente (30 de febrero) no pasa', () => {
    expect(ok({ from: '2026-02-30T00:00:00Z', to: '2026-03-02T00:00:00Z' })).toBe(false);
    expect(ok({ from: '2026-03-01T25:00:00Z', to: '2026-03-02T00:00:00Z' })).toBe(false);
  });

  it('el 29 de febrero solo existe en año bisiesto', () => {
    expect(ok({ from: '2028-02-29', to: '2028-03-01' })).toBe(true);
    expect(ok({ from: '2026-02-29', to: '2026-03-01' })).toBe(false);
  });

  it('un rango de 63 días con fechas YYYY-MM-DD falla; de 62 pasa (Lima, sin horario de verano)', () => {
    expect(ok({ from: '2026-01-01', to: '2026-03-04' })).toBe(true);
    expect(ok({ from: '2026-01-01', to: '2026-03-05' })).toBe(false);
  });

  it('studentId debe ser UUID y strict rechaza campos extra', () => {
    expect(ok({ from: '2026-03-01', to: '2026-03-02', studentId: '1' })).toBe(false);
    expect(ok({ from: '2026-03-01', to: '2026-03-02', extra: 1 })).toBe(false);
  });

  it('un instante sin segundos (T00:00-05:00) se rechaza, igual que en la web (validRange)', () => {
    // Alineado en la vuelta 1/2: la web también exige segundos (calendar.test.ts).
    expect(ok({ from: '2026-03-01T00:00-05:00', to: '2026-03-02T00:00-05:00' })).toBe(false);
  });
});
