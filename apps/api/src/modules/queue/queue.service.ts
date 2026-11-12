import { Injectable, Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.js';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  type EnqueueOptions,
  type JobData,
  QUEUE_PREFIX,
  type QueueName,
} from './queue.constants.js';
import { producerConnection } from './queue.connection.js';
import { assertJobData, assertJobId, assertJobName, isQueueName } from './queue.data.js';

/** Fabrica de colas; los tests la reemplazan para no abrir Redis. */
export const QUEUE_FACTORY = Symbol('QUEUE_FACTORY');
export type QueueFactory = (name: QueueName) => Queue;

const DAY_S = 24 * 60 * 60;
const MIN_EVERY_MS = 1000;

/**
 * Productor de trabajos (U1). La API y el worker encolan aqui; solo el worker los procesa.
 * Las colas se crean al primer uso: la API arranca aunque Redis no responda.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(QUEUE_FACTORY) private readonly factory: QueueFactory) {}

  /**
   * Encola un trabajo. data: solo ids y valores cortos (assertJobData). Con jobId, encolar dos
   * veces el mismo id no duplica el trabajo mientras BullMQ lo conserve (idempotencia, U2).
   * Devuelve el id del trabajo en BullMQ. Si Redis no responde, lanza el error de BullMQ.
   */
  async enqueue(
    queue: QueueName,
    name: string,
    data: JobData,
    options: EnqueueOptions = {},
  ): Promise<string> {
    assertJobName(name);
    assertJobData(data);
    if (options.jobId !== undefined) assertJobId(options.jobId);
    const job = await this.get(queue).add(name, data, {
      jobId: options.jobId,
      delay: options.delayMs,
      attempts: options.attempts ?? DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_MS },
      removeOnComplete: { age: DAY_S, count: 1000 },
      removeOnFail: { age: 7 * DAY_S },
    });
    return job.id ?? '';
  }

  /** Trabajo repetible (barridos): crea o actualiza el programador `<cola>:<nombre>`. */
  async schedule(
    queue: QueueName,
    name: string,
    everyMs: number,
    data: JobData = {},
  ): Promise<void> {
    assertJobName(name);
    assertJobData(data);
    if (!Number.isInteger(everyMs) || everyMs < MIN_EVERY_MS) {
      throw new Error(`Intervalo invalido para ${queue}:${name}`);
    }
    await this.get(queue).upsertJobScheduler(
      `${queue}:${name}`,
      { every: everyMs },
      {
        name,
        data,
        opts: {
          attempts: 1,
          removeOnComplete: { age: DAY_S, count: 100 },
          removeOnFail: { age: 7 * DAY_S },
        },
      },
    );
  }

  get(queue: QueueName): Queue {
    if (!isQueueName(queue)) throw new Error(`Cola desconocida: ${String(queue)}`);
    let q = this.queues.get(queue);
    if (!q) {
      q = this.factory(queue);
      // Sin este listener, un Redis caido produce "Unhandled error event" en cada reintento.
      q.on('error', (error: Error) => this.logger.warn(`Cola ${queue}: ${error.message}`));
      this.queues.set(queue, q);
    }
    return q;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}

export function defaultQueueFactory(env: Pick<Env, 'REDIS_URL'>): QueueFactory {
  return (name) => new Queue(name, { connection: producerConnection(env), prefix: QUEUE_PREFIX });
}
