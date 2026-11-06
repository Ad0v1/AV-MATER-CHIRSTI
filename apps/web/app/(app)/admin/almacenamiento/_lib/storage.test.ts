import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  exportStatusText,
  formatBytes,
  jobStatusText,
  type JobView,
  pickYear,
  purgeNotice,
  type YearBackupsView,
} from './storage';

const Y1 = '0f8fad5b-d9cb-469f-a165-70867728950e';
const Y2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NOW = new Date('2027-01-10T12:00:00Z');
const fmt = (iso: string) => iso.slice(0, 10);

const job = (over: Partial<JobView> = {}): JobView => ({
  id: Y1,
  type: 'PERSONAL_DATA_EXPORT',
  status: 'QUEUED',
  errorCode: null,
  resultBytes: null,
  hasResult: false,
  createdAt: NOW.toISOString(),
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  ...over,
});

const view = (purge: Partial<YearBackupsView['purge']>): YearBackupsView => ({
  academicYear: { id: Y1, year: 2026, closedAt: '2026-12-20T00:00:00Z' },
  purge: {
    state: 'WAITING_DEADLINE',
    purgeAfterDays: 60,
    eligibleAt: '2027-02-18T00:00:00Z',
    purgedAt: null,
    sectionsTotal: 2,
    sectionsBackedUp: 2,
    job: null,
    ...purge,
  },
  sections: [],
});

describe('formatBytes', () => {
  it('usa base 1024 y es-PE', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('pickYear', () => {
  const years = [{ academicYearId: Y2 }, { academicYearId: Y1 }];
  it('respeta el año de la URL si existe; si no, el más reciente', () => {
    expect(pickYear(Y1, years)).toBe(Y1);
    expect(pickYear('otro', years)).toBe(Y2);
    expect(pickYear(undefined, [])).toBeNull();
  });
});

describe('purgeNotice', () => {
  it('avisa los días que faltan y pide descargar', () => {
    const n = purgeNotice(view({}), NOW, fmt);
    expect(daysUntil('2027-02-18T00:00:00Z', NOW)).toBe(39);
    expect(n).toMatchObject({ tone: 'warning', title: 'La purga empezará en 39 días' });
    expect(n.body).toMatch(/2027-02-18/);
    expect(n.body).toMatch(/para siempre/);
  });

  it('sube a peligro en la última semana y en ELIGIBLE', () => {
    expect(purgeNotice(view({ eligibleAt: '2027-01-11T00:00:00Z' }), NOW, fmt)).toMatchObject({
      tone: 'danger',
      title: 'La purga empezará en 1 día',
    });
    expect(purgeNotice(view({ state: 'ELIGIBLE' }), NOW, fmt).tone).toBe('danger');
  });

  it('informa los demás estados', () => {
    expect(purgeNotice(view({ state: 'NOT_CLOSED' }), NOW, fmt).body).toMatch(/60 días/);
    expect(
      purgeNotice(view({ state: 'WAITING_BACKUPS', sectionsBackedUp: 1 }), NOW, fmt).body,
    ).toMatch(/1 de 2/);
    expect(
      purgeNotice(view({ state: 'PURGED', purgedAt: '2027-03-01T00:00:00Z' }), NOW, fmt).body,
    ).toMatch(/2027-03-01/);
  });
});

describe('textos de estado', () => {
  it('trabajos de respaldo', () => {
    expect(jobStatusText(null)).toBe('Sin respaldo todavía');
    expect(jobStatusText(job({ status: 'FAILED', errorCode: 'STALLED' }))).toMatch(/se detuvo/);
    expect(jobStatusText(job({ status: 'SUCCEEDED' }))).toBe('Listo');
  });

  it('exportación de datos personales', () => {
    expect(exportStatusText(job())).toBe('Exportación en cola.');
    expect(exportStatusText(job({ status: 'SUCCEEDED', hasResult: true }))).toMatch(/lista/);
    expect(exportStatusText(job({ status: 'SUCCEEDED' }))).toMatch(/ya no/);
    expect(exportStatusText(job({ status: 'EXPIRED' }))).toMatch(/venció/);
  });
});
