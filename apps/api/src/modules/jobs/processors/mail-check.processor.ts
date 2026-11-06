import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../../../config/config.module.js';
import { DEFAULT_SMTP_FROM, fromAddress, MailerService } from '../mailer.service.js';
import { JobProcessorRegistry, type JobProcessor } from '../processor.registry.js';

/**
 * notifications:mail-check. Prueba operativa del SMTP: envia el correo minimo de prueba a la
 * propia direccion de SMTP_FROM. No recibe datos, asi que no puede mandar correo a terceros.
 */
@Injectable()
export class MailCheckProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = 'mail-check';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ sent: true }> {
    await this.mailer.sendNotice(
      fromAddress(this.env.SMTP_FROM ?? DEFAULT_SMTP_FROM),
      'MAIL_CHECK',
    );
    return { sent: true };
  }
}
