import type { UserRole } from '../../common/auth/roles.js';
import type { JobStatus, JobType } from '../../generated/prisma/enums.js';
import type { QueueName } from '../queue/index.js';

export type { JobStatus, JobType };

/** Quien consulta un trabajo: el solicitante lo ve; ADMIN ve todos (docs/05). */
export type JobActor = { id: string; role: UserRole };

/** Vista publica de un BackgroundJob. Sin params ni clave del objeto (RNF-03/09). */
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

/** Cola y nombre de trabajo de cada tipo de BackgroundJob. */
export const JOB_ROUTES: Record<JobType, { queue: QueueName; name: string }> = {
  SECTION_EXPORT: { queue: 'exports', name: 'section-export' },
  BULK_EXPORT: { queue: 'exports', name: 'bulk-export' },
  PERSONAL_DATA_EXPORT: { queue: 'exports', name: 'personal-data-export' },
  YEAR_BACKUP: { queue: 'lifecycle', name: 'year-backup' },
  PURGE_YEAR: { queue: 'lifecycle', name: 'purge-year' },
};

/**
 * Error de un procesador con un codigo estable (A-Z, 0-9 y _, maximo 64) que se guarda en
 * BackgroundJob.errorCode. Nunca lleva datos del usuario. retryable=false corta los reintentos.
 */
export class JobError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = true,
  ) {
    super(code);
    this.name = 'JobError';
  }
}
