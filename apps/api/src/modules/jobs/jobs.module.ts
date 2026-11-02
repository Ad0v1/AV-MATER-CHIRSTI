import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/config.module.js';
import { QueueModule } from '../queue/index.js';
import { BackgroundJobService } from './background-job.service.js';
import { resultStorageProviders } from './job-result.storage.js';
import { createMailTransport, MAIL_TRANSPORT, MailerService } from './mailer.service.js';
import { JobProcessorRegistry } from './processor.registry.js';
import { TrackedJobRunner } from './tracked-job.runner.js';

// Trabajos en segundo plano de Dev 5 (RNF-19). Lo usan la API (crear y consultar BackgroundJob,
// URL de descarga) y el worker (procesadores, correo). Registrado en AppModule con autorizacion
// del usuario (30/10/2026). PrismaModule es global.
@Module({
  imports: [QueueModule],
  providers: [
    ...resultStorageProviders,
    BackgroundJobService,
    TrackedJobRunner,
    JobProcessorRegistry,
    { provide: MAIL_TRANSPORT, inject: [ENV], useFactory: (env: Env) => createMailTransport(env) },
    MailerService,
  ],
  exports: [
    BackgroundJobService,
    TrackedJobRunner,
    JobProcessorRegistry,
    MailerService,
    QueueModule,
  ],
})
export class JobsModule implements OnModuleDestroy {
  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: Transporter) {}

  onModuleDestroy(): void {
    this.transport.close();
  }
}
