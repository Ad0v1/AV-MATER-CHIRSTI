import { describe, expect, it } from 'vitest';
import { LIMA_OFFSET_MINUTES, limaArrayFromTimestamp } from './lima-time';
import { formatDue } from './calendar';

describe('hora de Lima (RF-54)', () => {
  it('UTC-5 fijo', () => {
    expect(LIMA_OFFSET_MINUTES).toBe(-300);
  });

  it('un vencimiento a las 04:59 UTC es el día anterior a las 23:59 en Lima', () => {
    expect(limaArrayFromTimestamp(Date.parse('2026-03-11T04:59:30.250Z'))).toEqual([
      2026, 2, 10, 23, 59, 30, 250,
    ]);
  });

  it('cambio de año y coherencia con formatDue (aria-label)', () => {
    expect(limaArrayFromTimestamp(Date.parse('2027-01-01T03:00:00Z')).slice(0, 4)).toEqual([
      2026, 11, 31, 22,
    ]);
    expect(formatDue('2027-01-01T03:00:00Z')).toMatch(/31 de diciembre/);
  });
});
