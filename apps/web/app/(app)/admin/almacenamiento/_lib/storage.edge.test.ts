import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  exportStatusText,
  formatBytes,
  isJobActive,
  JOB_STATUS_LABELS,
  type JobStatus,
  jobStatusText,
  type JobView,
  pickYear,
  PURGE_STATE_LABELS,
  purgeNotice,
  type PurgeState,
  type YearBackupsView,
} from './storage';

// RF-63, RF-65..67; U6, U7: casos límite de la lógica pura de /admin/almacenamiento.

const Y1 = '0f8fad5b-d9cb-469f-a165-70867728950e';
const Y2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NOW = new Date('2027-01-10T12:00:00Z');
const DAY = 86_400_000;
const fmt = (iso: string) => iso.slice(0, 10);
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

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

describe('RF-67: formatBytes en sus bordes', () => {
  it('1023 B y 1024 B cambian de unidad', () => {
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('99,9 y 100 usan uno y cero decimales', () => {
    expect(formatBytes(1024 * 99.9)).toBe('99,9 KB');
    expect(formatBytes(1024 * 100)).toBe('100 KB');
  });

  it('NaN, Infinity, undefined, null y negativos dan raya', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, -1, -0.5]) {
      expect(formatBytes(v as number), String(v)).toBe('—');
    }
  });

  it('TB es la última unidad y no se pasa de ahí', () => {
    expect(formatBytes(1024 ** 4)).toBe('1 TB');
    expect(formatBytes(5000 * 1024 ** 4)).toBe('5000 TB');
  });

  it('usa coma decimal y no deja ceros sobrantes', () => {
    expect(formatBytes(1024 * 1.5)).toBe('1,5 KB');
    expect(formatBytes(1024 * 2)).toBe('2 KB');
  });

  // Defecto cosmético (hallazgo QA 5g, BAJO): justo debajo de 1 MiB el redondeo da "1024 KB" en
  // vez de "1 MB". Cuando se corrija formatBytes, quitar `.fails`.
  it('1 MiB menos 1 byte se muestra como 1 MB, no como 1024 KB', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1 MB');
  });
});

describe('RF-65: pickYear en sus bordes', () => {
  const years = [{ academicYearId: Y2 }, { academicYearId: Y1 }];

  it('el primer valor de un arreglo, un id desconocido y la lista vacía', () => {
    expect(pickYear([Y1, Y2], years)).toBe(Y1);
    expect(pickYear([], years)).toBe(Y2);
    expect(pickYear('0f8fad5b-d9cb-469f-a165-000000000000', years)).toBe(Y2);
    expect(pickYear(Y1, [])).toBeNull();
    expect(pickYear('', years)).toBe(Y2);
  });

  it('un UUID con otras mayúsculas no coincide y vuelve al más reciente', () => {
    expect(pickYear(Y1.toUpperCase(), years)).toBe(Y2);
  });

  it('una inyección no es un id y no rompe', () => {
    expect(pickYear("'; DROP TABLE x;--", years)).toBe(Y2);
  });
});

describe('U7: daysUntil y el aviso de purga en el límite', () => {
  it('fecha pasada = 0; ahora mismo = 0; un milisegundo después = 1 día', () => {
    expect(daysUntil(at(-DAY), NOW)).toBe(0);
    expect(daysUntil(at(0), NOW)).toBe(0);
    expect(daysUntil(at(1), NOW)).toBe(1);
    expect(daysUntil(at(DAY), NOW)).toBe(1);
    expect(daysUntil(at(DAY + 1), NOW)).toBe(2);
  });

  it('siete días = peligro; ocho = advertencia', () => {
    expect(purgeNotice(view({ eligibleAt: at(7 * DAY) }), NOW, fmt)).toMatchObject({
      tone: 'danger',
      title: 'La purga empezará en 7 días',
    });
    expect(purgeNotice(view({ eligibleAt: at(7 * DAY + 1) }), NOW, fmt)).toMatchObject({
      tone: 'warning',
      title: 'La purga empezará en 8 días',
    });
  });

  it('plazo ya vencido en WAITING_DEADLINE: 0 días y en peligro', () => {
    expect(purgeNotice(view({ eligibleAt: at(-DAY) }), NOW, fmt)).toMatchObject({
      tone: 'danger',
      title: 'La purga empezará en 0 días',
    });
  });

  it('sin eligibleAt usa purgeAfterDays', () => {
    const n = purgeNotice(view({ eligibleAt: null, purgeAfterDays: 60 }), NOW, fmt);
    expect(n.title).toBe('La purga empezará en 60 días');
    expect(n.tone).toBe('warning');
  });

  it('el aviso aclara que las notas y la bitácora se conservan y que se borran los respaldos', () => {
    const n = purgeNotice(view({}), NOW, fmt);
    expect(n.body).toMatch(/notas y la bitácora se conservan/);
    expect(n.body).toMatch(/respaldos/);
  });

  it('PURGED sin fecha no escribe "undefined" ni "null"', () => {
    const n = purgeNotice(view({ state: 'PURGED', purgedAt: null }), NOW, fmt);
    expect(n.body).not.toMatch(/undefined|null/);
    expect(n.tone).toBe('info');
  });

  it('WAITING_BACKUPS con 0 de 0 secciones no revienta', () => {
    const n = purgeNotice(
      view({ state: 'WAITING_BACKUPS', sectionsBackedUp: 0, sectionsTotal: 0 }),
      NOW,
      fmt,
    );
    expect(n.body).toMatch(/0 de 0/);
  });

  it('cada estado de la purga tiene etiqueta y un aviso con título y cuerpo', () => {
    const states = Object.keys(PURGE_STATE_LABELS) as PurgeState[];
    expect(states).toHaveLength(5);
    for (const state of states) {
      const n = purgeNotice(view({ state }), NOW, fmt);
      expect(n.title.length, state).toBeGreaterThan(0);
      expect(n.body.length, state).toBeGreaterThan(0);
      expect(['info', 'warning', 'danger']).toContain(n.tone);
    }
  });
});

describe('RF-65 y RF-63: estados de trabajos', () => {
  it('isJobActive: solo QUEUED y RUNNING', () => {
    const statuses = Object.keys(JOB_STATUS_LABELS) as JobStatus[];
    expect(statuses.filter(isJobActive)).toEqual(['QUEUED', 'RUNNING']);
  });

  it('jobStatusText cubre cada estado y distingue STALLED de otro fallo', () => {
    expect(jobStatusText(job({ status: 'QUEUED' }))).toBe('En cola');
    expect(jobStatusText(job({ status: 'RUNNING' }))).toBe('En proceso');
    expect(jobStatusText(job({ status: 'EXPIRED' }))).toBe('Vencido');
    expect(jobStatusText(job({ status: 'FAILED', errorCode: null }))).toBe(
      'Falló; se reintentará en el próximo barrido',
    );
    expect(jobStatusText(job({ status: 'FAILED', errorCode: 'S3_ERROR' }))).not.toMatch(/detuvo/);
  });

  it('jobStatusText nunca muestra el código de error crudo', () => {
    expect(jobStatusText(job({ status: 'FAILED', errorCode: 'PURGE_NOT_ELIGIBLE' }))).not.toMatch(
      /PURGE_NOT_ELIGIBLE/,
    );
  });

  it('exportStatusText cubre RUNNING y FAILED sin mostrar el código', () => {
    expect(exportStatusText(job({ status: 'RUNNING' }))).toMatch(/Preparando/);
    expect(exportStatusText(job({ status: 'FAILED', errorCode: 'XYZ' }))).toMatch(/falló/);
    expect(exportStatusText(job({ status: 'FAILED', errorCode: 'XYZ' }))).not.toMatch(/XYZ/);
  });
});
