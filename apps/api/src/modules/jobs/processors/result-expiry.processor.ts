import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { BackgroundJobService } from '../background-job.service.js';
import { JobProcessorRegistry, type JobProcessor } from '../processor.registry.js';

/**
 * maintenance:result-expiry-sweep (U6). Borra los resultados vencidos y los marca EXPIRED, y pasa a
 * FAILED con STALLED los RUNNING colgados (seguridad 5b, hallazgo 7).
 */
@Injectable()
export class ResultExpiryProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'result-expiry-sweep';
  readonly everyMs = 60 * 60 * 1000;
  private readonly logger = new Logger(ResultExpiryProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly jobs: BackgroundJobService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ expired: number; stalled: number }> {
    const now = new Date();
    const expired = await this.jobs.expireResults(now);
    const stalled = await this.jobs.failStalled(now);
    if (expired > 0) this.logger.log(`Resultados vencidos: ${expired}`);
    if (stalled > 0) this.logger.warn(`Trabajos colgados marcados FAILED: ${stalled}`);
    return { expired, stalled };
  }
}
