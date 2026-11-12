/**
 * Colas de trabajos en segundo plano (Dev 5, RNF-19, U1/U2). BullMQ sobre Redis (REDIS_URL).
 * - notifications: avisos en la plataforma y correos minimos (RF-53, U3).
 * - exports: reportes XLSX/PDF, ZIP masivos y datos personales (RF-57..60, RF-63).
 * - lifecycle: respaldo anual y purga (RF-64..66, U7).
 * - maintenance: barridos periodicos (NE, intents de subida, vencimiento de resultados).
 */
export const QUEUE_NAMES = ['notifications', 'exports', 'lifecycle', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Prefijo de las claves de BullMQ en Redis; separa las colas de las sesiones. */
export const QUEUE_PREFIX = 'aula:bull';

/** Reintentos por defecto: 3 intentos con espera exponencial desde 10 s. */
export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = 10_000;

/**
 * Datos de un trabajo: solo ids, fechas ISO, conteos y banderas (RNF-09). Nunca nombres,
 * correos, notas ni textos libres: Redis no esta cifrado y los trabajos se ven en el log.
 */
export type JobDataValue = string | number | boolean | null | string[];
export type JobData = Record<string, JobDataValue>;

export interface EnqueueOptions {
  /** Id del trabajo en BullMQ: hace idempotente el encolado (mismo id = mismo trabajo). */
  jobId?: string;
  delayMs?: number;
  /** Intentos totales (por defecto DEFAULT_ATTEMPTS). */
  attempts?: number;
}
