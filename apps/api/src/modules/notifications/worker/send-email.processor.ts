import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { deliverableEmail, MailerService } from '../../jobs/mailer.service.js';
import { JobProcessorRegistry, type JobProcessor } from '../../jobs/processor.registry.js';
import { DEFAULT_ATTEMPTS } from '../../queue/index.js';
import { EMAIL_BATCH, NOTIFICATION_JOBS, RETENTION } from '../notification.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Tras estos fallos seguidos se asume el SMTP caído: se corta el lote y se reintenta luego. */
const MAX_CONSECUTIVE_FAILURES = 3;

const dataSchema = z.object({ notificationIds: z.array(z.uuid()).min(1).max(EMAIL_BATCH) });

export type SendEmailResult = { sent: number; skipped: number; failed: number };

/**
 * notifications:send-email. Envía el correo mínimo (U3, MailerService.sendNotice: sin nombres,
 * notas ni títulos) de un lote de avisos. Solo los PENDING: repetir el trabajo no reenvía los
 * SENT. Destinatario no ACTIVE o sin correo válido → SKIPPED; aviso con más de 7 días → SKIPPED.
 * Si un envío falla, el trabajo se reintenta (solo quedan los PENDING); en el último intento
 * los que siguen pendientes pasan a FAILED. El log solo lleva conteos.
 */
@Injectable()
export class SendEmailProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = NOTIFICATION_JOBS.sendEmail;
  private readonly logger = new Logger(SendEmailProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(job: Job): Promise<SendEmailResult> {
    const parsed = dataSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('INVALID_DATA');
    const ids = parsed.data.notificationIds;
    const now = new Date();
    const cutoff = new Date(now.getTime() - RETENTION.emailRetryDays * DAY_MS);

    const stale = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, emailStatus: 'PENDING', createdAt: { lt: cutoff } },
      data: { emailStatus: 'SKIPPED' },
    });
    const rows = await this.prisma.notification.findMany({
      where: { id: { in: ids }, emailStatus: 'PENDING' },
      select: { id: true, type: true, recipientId: true },
      orderBy: { id: 'asc' },
    });
    const users = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.recipientId))] } },
          select: { id: true, status: true, contactEmail: true, emailVerifiedAt: true },
        })
      ).map((u) => [u.id, u]),
    );

    let sent = 0;
    let skipped = stale.count;
    let failed = 0;
    let consecutive = 0;
    for (const row of rows) {
      const user = users.get(row.recipientId);
      const email = user ? deliverableEmail(user) : null;
      if (!user || user.status !== 'ACTIVE' || !email) {
        skipped += await this.mark(row.id, { emailStatus: 'SKIPPED' });
        continue;
      }
      try {
        await this.mailer.sendNotice(email, row.type);
      } catch {
        failed++;
        consecutive++;
        if (consecutive >= MAX_CONSECUTIVE_FAILURES) break;
        continue;
      }
      consecutive = 0;
      sent += await this.mark(row.id, { emailStatus: 'SENT', emailSentAt: new Date() });
    }

    if (failed > 0) {
      const attempts = job.opts.attempts ?? DEFAULT_ATTEMPTS;
      if (job.attemptsMade + 1 >= attempts) {
        await this.prisma.notification.updateMany({
          where: { id: { in: ids }, emailStatus: 'PENDING' },
          data: { emailStatus: 'FAILED' },
        });
      }
      this.logger.warn(
        `Lote de correos: ${sent} enviados, ${skipped} omitidos, ${failed} fallidos`,
      );
      throw new Error('MAIL_FAILED');
    }
    return { sent, skipped, failed };
  }

  /** Cambia el estado solo si sigue PENDING (otro intento pudo adelantarse). */
  private async mark(
    id: string,
    data: { emailStatus: 'SENT' | 'SKIPPED'; emailSentAt?: Date },
  ): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { id, emailStatus: 'PENDING' },
      data,
    });
    return res.count;
  }
}
