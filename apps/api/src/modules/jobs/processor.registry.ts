import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { type JobData, type QueueName } from '../queue/index.js';
import { assertJobName } from '../queue/queue.data.js';

/**
 * Procesador de un trabajo: una clase @Injectable que se registra en onModuleInit con
 * `registry.register(this)`. El worker despacha por `<cola>:<nombre>`.
 * everyMs: si esta, el worker programa el trabajo como repetible (barridos de maintenance).
 */
export interface JobProcessor<T extends JobData = JobData> {
  readonly queue: QueueName;
  readonly name: string;
  readonly everyMs?: number;
  handle(job: Job<T>): Promise<unknown>;
}

@Injectable()
export class JobProcessorRegistry {
  private readonly processors = new Map<string, JobProcessor>();

  register(processor: JobProcessor): void {
    assertJobName(processor.name);
    const key = `${processor.queue}:${processor.name}`;
    if (this.processors.has(key)) throw new Error(`Procesador duplicado: ${key}`);
    this.processors.set(key, processor);
  }

  get(queue: QueueName, name: string): JobProcessor | undefined {
    return this.processors.get(`${queue}:${name}`);
  }

  /** Colas con al menos un procesador: el worker solo abre esas. */
  queues(): QueueName[] {
    return [...new Set([...this.processors.values()].map((p) => p.queue))];
  }

  scheduled(): JobProcessor[] {
    return [...this.processors.values()].filter((p) => p.everyMs !== undefined);
  }

  all(): JobProcessor[] {
    return [...this.processors.values()];
  }
}
