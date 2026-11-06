import type { JobStatus } from '../../generated/prisma/enums.js';

// Reglas puras del ciclo de vida del año (RF-64..66, U6, U7). Sin BD: las usan el listado de
// respaldos, el barrido diario y el procesador PURGE_YEAR, y se prueban con datos en memoria.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de la purga de un año:
 * - NOT_CLOSED: el año sigue abierto (no se respalda ni se purga).
 * - WAITING_BACKUPS: falta el respaldo SUCCEEDED de alguna sección (o hay uno en curso).
 * - WAITING_DEADLINE: respaldos listos; aún no se cumple closedAt + purgeAfterDays.
 * - ELIGIBLE: se puede purgar (U7).
 * - PURGED: ya hay un PURGE_YEAR SUCCEEDED.
 */
export type PurgeState =
  'NOT_CLOSED' | 'WAITING_BACKUPS' | 'WAITING_DEADLINE' | 'ELIGIBLE' | 'PURGED';

export interface BackupRowLite {
  sectionId: string | null;
  status: JobStatus;
  createdAt: Date;
}

export interface PurgeInput {
  closedAt: Date | null;
  purgeAfterDays: number;
  sectionIds: string[];
  backups: BackupRowLite[];
  purgedAt: Date | null;
  now: Date;
}

export interface PurgeStatus {
  state: PurgeState;
  /** closedAt + purgeAfterDays; null si el año sigue abierto. */
  eligibleAt: Date | null;
  sectionsTotal: number;
  sectionsBackedUp: number;
}

/** El respaldo vigente de cada sección: el más reciente por createdAt. */
export function latestBackupBySection<T extends BackupRowLite>(rows: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (!row.sectionId) continue;
    const current = latest.get(row.sectionId);
    if (!current || row.createdAt > current.createdAt) latest.set(row.sectionId, row);
  }
  return latest;
}

/**
 * Un respaldo cuenta como hecho si terminó bien. EXPIRED solo lo deja la purga del año (los ZIP
 * anuales no vencen solos, U6): así, si la purga se corta y reintenta, sigue siendo elegible.
 */
export function isBackedUp(status: JobStatus | undefined): boolean {
  return status === 'SUCCEEDED' || status === 'EXPIRED';
}

/** U7: año cerrado, todas sus secciones respaldadas y el plazo cumplido. */
export function purgeStatus(input: PurgeInput): PurgeStatus {
  const latest = latestBackupBySection(input.backups);
  const sectionsBackedUp = input.sectionIds.filter((id) =>
    isBackedUp(latest.get(id)?.status),
  ).length;
  const base = { sectionsTotal: input.sectionIds.length, sectionsBackedUp };
  if (!input.closedAt) return { state: 'NOT_CLOSED', eligibleAt: null, ...base };
  const eligibleAt = new Date(input.closedAt.getTime() + input.purgeAfterDays * DAY_MS);
  if (input.purgedAt) return { state: 'PURGED', eligibleAt, ...base };
  if (sectionsBackedUp < input.sectionIds.length) {
    return { state: 'WAITING_BACKUPS', eligibleAt, ...base };
  }
  if (input.now < eligibleAt) return { state: 'WAITING_DEADLINE', eligibleAt, ...base };
  return { state: 'ELIGIBLE', eligibleAt, ...base };
}

/**
 * Secciones a las que hay que encolar respaldo: sin ninguno, o cuyo último respaldo falló.
 * Las que tienen uno QUEUED, RUNNING, SUCCEEDED o EXPIRED no se repiten (idempotente, U2).
 */
export function sectionsNeedingBackup(sectionIds: string[], backups: BackupRowLite[]): string[] {
  const latest = latestBackupBySection(backups);
  return sectionIds.filter((id) => {
    const status = latest.get(id)?.status;
    return status === undefined || status === 'FAILED';
  });
}
