import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, type Processor, UnrecoverableError, Worker } from 'bullmq';
import { ENV, type Env } from '../../config/config.module.js';
import { QUEUE_PREFIX, type QueueName, QueueService, workerConnection } from '../queue/index.js';
import { JobProcessorRegistry } from './processor.registry.js';

/** Fabrica de workers de BullMQ; los tests la reemplazan para no abrir Redis. */
export const WORKER_FACTORY = Symbol('WORKER_FACTORY');
export type WorkerFactory = (queue: QueueName, processor: Processor) => Worker;

export function defaultWorkerFactory(env: Env): WorkerFactory {
  return (queue, processor) =>
    new Worker(queue, processor, {
      connection: workerConnection(env),
      prefix: QUEUE_PREFIX,
      concurrency: env.WORKER_CONCURRENCY,
    });
}

/**
 * Consumidor de las colas (solo en worker.main.ts, U1). Abre un Worker por cola con
 * procesadores, despacha por nombre y programa los barridos (everyMs). Al apagar espera a que
 * terminen los trabajos en curso.
 */
@Injectable()
export class WorkerHost implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private readonly workers: Worker[] = [];

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly queues: QueueService,
    @Inject(WORKER_FACTORY) private readonly factory: WorkerFactory,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const queue of this.registry.queues()) {
      const worker = this.factory(queue, (job) => this.dispatch(queue, job));
      // Solo id, nombre e intento: los datos y el mensaje pueden traer informacion (RNF-09).
      worker.on('failed', (job: Job | undefined) =>
        this.logger.warn(`Fallo ${queue}:${job?.name ?? '?'} id=${job?.id ?? '?'}`),
      );
      worker.on('error', (error: Error) => this.logger.error(`Cola ${queue}: ${error.name}`));
      this.workers.push(worker);
    }
    for (const p of this.registry.scheduled()) {
      await this.queues.schedule(p.queue, p.name, p.everyMs!);
    }
    const names = this.registry.all().map((p) => `${p.queue}:${p.name}`);
    this.logger.log(`Procesando ${names.length} trabajos: ${names.join(', ')}`);
  }

  async dispatch(queue: QueueName, job: Job): Promise<unknown> {
    const processor = this.registry.get(queue, job.name);
    if (!processor) throw new UnrecoverableError('UNKNOWN_JOB');
    return processor.handle(job);
  }

  /**
   * Deja de tomar trabajos y espera a los que estan en curso. worker.main.ts lo llama antes de
   * app.close(), asi Prisma no se desconecta con un trabajo a medias. Idempotente.
   */
  async stop(): Promise<void> {
    const closing = this.workers.splice(0).map((w) => w.close());
    await Promise.allSettled(closing);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}

export const workerHostProviders = [
  { provide: WORKER_FACTORY, inject: [ENV], useFactory: (env: Env) => defaultWorkerFactory(env) },
  WorkerHost,
];
