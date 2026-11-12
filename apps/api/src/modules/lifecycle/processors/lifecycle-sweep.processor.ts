import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobProcessorRegistry, type JobProcessor } from '../../jobs/index.js';
import { LifecycleService } from '../lifecycle.service.js';

/**
 * maintenance:lifecycle-sweep (RF-65, RF-66, U2, U7). Una vez al día: en cada año cerrado sin
 * purgar encola los respaldos que falten (si el evento de cierre se perdió o un respaldo falló) y
 * la purga cuando el año ya es elegible. La purga misma vuelve a comprobar todo antes de borrar.
 */
@Injectable()
export class LifecycleSweepProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'lifecycle-sweep';
  readonly everyMs = 24 * 60 * 60 * 1000;
  private readonly logger = new Logger(LifecycleSweepProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly lifecycle: LifecycleService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ backups: number; purges: number }> {
    const result = await this.lifecycle.sweep(new Date());
    if (result.backups > 0 || result.purges > 0) {
      this.logger.log(`Respaldos encolados: ${result.backups}; purgas encoladas: ${result.purges}`);
    }
    return result;
  }
}
