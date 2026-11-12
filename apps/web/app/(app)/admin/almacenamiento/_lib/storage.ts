// Lógica pura de /admin/almacenamiento (RF-63, RF-65..67; U6, U7), probada con Vitest.
// Tipos copiados de apps/api/src/modules/lifecycle/lifecycle.service.ts y jobs/jobs.types.ts.
import { isUuid } from '../../_shared/lib/validation';

export const STORAGE_PATH = '/admin/almacenamiento';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
export type JobType =
  'SECTION_EXPORT' | 'BULK_EXPORT' | 'PERSONAL_DATA_EXPORT' | 'YEAR_BACKUP' | 'PURGE_YEAR';

export interface JobView {
  id: string;
  type: JobType;
  status: JobStatus;
  errorCode: string | null;
  resultBytes: number | null;
  hasResult: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
}

export interface UsageBucket {
  bytes: number;
  files: number;
}

export interface StorageUsageView {
  academicYearId: string | null;
  total: UsageBucket;
  years: Array<
    UsageBucket & {
      academicYearId: string;
      year: number;
      closedAt: string | null;
      backupBytes: number;
    }
  >;
  grades: Array<UsageBucket & { academicYearId: string; gradeLevel: number }>;
  courses: Array<
    UsageBucket & {
      academicYearId: string;
      gradeLevel: number;
      courseId: string;
      courseName: string;
    }
  >;
}

export type PurgeState =
  'NOT_CLOSED' | 'WAITING_BACKUPS' | 'WAITING_DEADLINE' | 'ELIGIBLE' | 'PURGED';

export interface YearBackupsView {
  academicYear: { id: string; year: number; closedAt: string | null };
  purge: {
    state: PurgeState;
    purgeAfterDays: number;
    eligibleAt: string | null;
    purgedAt: string | null;
    sectionsTotal: number;
    sectionsBackedUp: number;
    job: JobView | null;
  };
  sections: Array<{ sectionId: string; gradeLevel: number; code: string; backup: JobView | null }>;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUEUED: 'En cola',
  RUNNING: 'En proceso',
  SUCCEEDED: 'Listo',
  FAILED: 'Falló',
  EXPIRED: 'Vencido',
};

export const isJobActive = (s: JobStatus): boolean => s === 'QUEUED' || s === 'RUNNING';

export const PURGE_STATE_LABELS: Record<PurgeState, string> = {
  NOT_CLOSED: 'El año sigue abierto',
  WAITING_BACKUPS: 'Esperando respaldos',
  WAITING_DEADLINE: 'Esperando el plazo',
  ELIGIBLE: 'Purga programada',
  PURGED: 'Purgado',
};

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1,5 KB" (base 1024, coma decimal; sin Intl para no depender del ICU). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  let rounded = Number(value.toFixed(digits));
  // 1048575 B redondea a 1024 KB: se muestra como 1 MB.
  if (rounded >= 1024 && unit < UNITS.length - 1) {
    rounded = 1;
    unit++;
  }
  const text = rounded.toString().replace('.', ',');
  return `${text} ${UNITS[unit]}`;
}

/** Año elegido en la URL (?anio=<uuid>) si existe en la lista; si no, el más reciente. */
export function pickYear(
  param: string | string[] | undefined,
  years: Array<{ academicYearId: string }>,
): string | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (isUuid(raw) && years.some((y) => y.academicYearId === raw)) return raw;
  return years[0]?.academicYearId ?? null;
}

const DAY_MS = 86_400_000;

/** Días enteros que faltan hasta `iso` (0 si ya pasó). */
export function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / DAY_MS));
}

export type PurgeNotice = { tone: 'info' | 'warning' | 'danger'; title: string; body: string };

/**
 * Aviso de la purga del año (U7). La purga es irreversible y automática: se programa sola cuando
 * el año está cerrado, todas las secciones tienen respaldo y pasó el plazo. Este texto es el
 * aviso previo para que el ADMIN descargue los respaldos a tiempo.
 */
export function purgeNotice(
  view: YearBackupsView,
  now: Date,
  formatDate: (iso: string) => string,
): PurgeNotice {
  const p = view.purge;
  const backups = `${p.sectionsBackedUp} de ${p.sectionsTotal} secciones con respaldo`;
  switch (p.state) {
    case 'NOT_CLOSED':
      return {
        tone: 'info',
        title: 'Sin purga por ahora',
        body: `Los respaldos y la purga empiezan cuando se cierre el año. Después del cierre hay ${p.purgeAfterDays} días antes de purgar.`,
      };
    case 'WAITING_BACKUPS':
      return {
        tone: 'info',
        title: 'Generando respaldos',
        body: `${backups}. La purga no empieza hasta que todas las secciones tengan su respaldo listo.`,
      };
    case 'WAITING_DEADLINE': {
      const days = p.eligibleAt ? daysUntil(p.eligibleAt, now) : p.purgeAfterDays;
      const when = p.eligibleAt ? formatDate(p.eligibleAt) : '';
      return {
        tone: days <= 7 ? 'danger' : 'warning',
        title: `La purga empezará en ${days} ${days === 1 ? 'día' : 'días'}`,
        body: `Desde el ${when} se borrarán para siempre los PDF de materiales, tareas y entregas de este año, y también estos respaldos. Las notas y la bitácora se conservan. Descarga ahora los respaldos que necesites guardar.`,
      };
    }
    case 'ELIGIBLE':
      return {
        tone: 'danger',
        title: 'Purga en curso o por empezar',
        body: 'Se cumplió el plazo: los PDF del año y sus respaldos se borrarán para siempre. Si todavía necesitas algún respaldo, descárgalo de inmediato.',
      };
    case 'PURGED':
      return {
        tone: 'info',
        title: 'Año purgado',
        body: `Los archivos del año y sus respaldos se borraron${p.purgedAt ? ` el ${formatDate(p.purgedAt)}` : ''}. Las notas y la bitácora se conservan.`,
      };
  }
}

/** Texto del estado de un trabajo, con el motivo legible si falló. */
export function jobStatusText(job: JobView | null): string {
  if (!job) return 'Sin respaldo todavía';
  if (job.status === 'FAILED') {
    return job.errorCode === 'STALLED'
      ? 'Falló (se detuvo); se reintentará en el próximo barrido'
      : 'Falló; se reintentará en el próximo barrido';
  }
  return JOB_STATUS_LABELS[job.status];
}

/** Mensaje del estado del export de datos personales para la región de estado. */
export function exportStatusText(job: JobView): string {
  switch (job.status) {
    case 'QUEUED':
      return 'Exportación en cola.';
    case 'RUNNING':
      return 'Preparando la exportación…';
    case 'SUCCEEDED':
      return job.hasResult
        ? 'Exportación lista para descargar.'
        : 'La exportación ya no está disponible.';
    case 'FAILED':
      return 'La exportación falló. Vuelve a intentarlo.';
    case 'EXPIRED':
      return 'La exportación venció. Solicita una nueva.';
  }
}
