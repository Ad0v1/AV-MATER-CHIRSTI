import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { FileLifecycleService } from '../../files/file-lifecycle.service.js';
import { JobProcessorRegistry, type JobProcessor } from '../processor.registry.js';

/**
 * maintenance:intent-sweep (RNF-03/18, U12). Vence los intents de subida abandonados con
 * FileLifecycleService de Dev 3 (dueño de StoredFile), que borra incoming/ y deja la bitacora.
 */
@Injectable()
export class IntentSweepProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'intent-sweep';
  readonly everyMs = 10 * 60 * 1000;
  private readonly logger = new Logger(IntentSweepProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly files: FileLifecycleService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ expired: number }> {
    const expired = await this.files.expireIntents(new Date());
    if (expired > 0) this.logger.log(`Barrido de intents: ${expired} vencidos`);
    return { expired };
  }
}
