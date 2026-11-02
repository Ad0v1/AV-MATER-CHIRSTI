import { Injectable, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { DEFAULT_ATTEMPTS } from '../queue/index.js';
import { BackgroundJobService, type JobResult, type StartedJob } from './background-job.service.js';
import { JobError } from './jobs.types.js';

/** Datos que lleva en la cola un trabajo con fila BackgroundJob (los encola create()). */
export type TrackedJobData = { backgroundJobId: string };

/**
 * Envuelve un procesador de un BackgroundJob (exports y lifecycle): marca RUNNING, ejecuta,
 * marca SUCCEEDED y, en el ultimo intento fallido (o con JobError no reintentable), FAILED.
 * Si la fila ya termino, no hace nada: BullMQ entrega al menos una vez.
 */
@Injectable()
export class TrackedJobRunner {
  private readonly logger = new Logger(TrackedJobRunner.name);

  constructor(private readonly jobs: BackgroundJobService) {}

  async run(
    job: Job<TrackedJobData>,
    work: (started: StartedJob) => Promise<JobResult | null>,
  ): Promise<void> {
    const id = job.data.backgroundJobId;
    const started = await this.jobs.start(id);
    if (!started) {
      this.logger.warn(`Trabajo ${id} inexistente o ya terminado; se omite`);
      return;
    }
    let result: JobResult | null;
    try {
      result = await work(started);
    } catch (error) {
      const code = error instanceof JobError ? error.code : 'INTERNAL_ERROR';
      const retryable = !(error instanceof JobError) || error.retryable;
      const attempts = job.opts.attempts ?? DEFAULT_ATTEMPTS;
      const last = !retryable || job.attemptsMade + 1 >= attempts;
      if (last) await this.jobs.fail(id, code);
      // Solo el codigo: el mensaje puede traer datos (RNF-09).
      this.logger.warn(`Trabajo ${id} fallo (${code}), intento ${job.attemptsMade + 1}`);
      if (!retryable) throw new UnrecoverableError(code);
      throw new Error(code);
    }
    await this.jobs.succeed(id, result);
  }
}
