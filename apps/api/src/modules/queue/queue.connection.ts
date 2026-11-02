import type { ConnectionOptions } from 'bullmq';
import type { Env } from '../../config/env.js';

/** Conexion del productor (API): falla rapido si Redis no responde, en vez de colgar la peticion. */
export function producerConnection(env: Pick<Env, 'REDIS_URL'>): ConnectionOptions {
  return { url: env.REDIS_URL, enableOfflineQueue: false, maxRetriesPerRequest: 2 };
}

/** Conexion del worker: BullMQ exige maxRetriesPerRequest null en las conexiones bloqueantes. */
export function workerConnection(env: Pick<Env, 'REDIS_URL'>): ConnectionOptions {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null };
}
