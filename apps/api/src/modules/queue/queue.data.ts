import { type JobData, QUEUE_NAMES, type QueueName } from './queue.constants.js';

const KEY = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const JOB_NAME = /^[a-z][a-z0-9-]{0,62}$/;
// Sin ':' (BullMQ lo usa en sus claves) ni espacios: un uuid o una clave de deduplicacion.
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_STRING = 64;
const MAX_ARRAY = 500;
const MAX_KEYS = 20;

export function isQueueName(value: string): value is QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(value);
}

export function assertJobName(name: string): void {
  if (!JOB_NAME.test(name)) throw new Error(`Nombre de trabajo invalido: ${name}`);
}

export function assertJobId(jobId: string): void {
  if (!JOB_ID.test(jobId)) throw new Error('Id de trabajo invalido');
}

function validString(value: string): boolean {
  // '@' delata un correo y los saltos de linea, texto libre: ninguno va a Redis (RNF-09).
  return value.length <= MAX_STRING && !/[@\r\n]/.test(value);
}

/**
 * Comprueba que los datos de un trabajo solo lleven valores cortos (ids, fechas, conteos).
 * Lanza Error (de programacion): quien encola nunca pasa datos del usuario sin validar.
 */
export function assertJobData(data: unknown): asserts data is JobData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Los datos del trabajo deben ser un objeto');
  }
  const entries = Object.entries(data);
  if (entries.length > MAX_KEYS) throw new Error('Los datos del trabajo tienen demasiadas claves');
  for (const [key, value] of entries) {
    if (!KEY.test(key)) throw new Error(`Clave invalida en los datos del trabajo: ${key}`);
    const ok =
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && validString(value)) ||
      (Array.isArray(value) &&
        value.length <= MAX_ARRAY &&
        value.every((v) => typeof v === 'string' && validString(v)));
    if (!ok) throw new Error(`Valor invalido en los datos del trabajo: ${key}`);
  }
}
