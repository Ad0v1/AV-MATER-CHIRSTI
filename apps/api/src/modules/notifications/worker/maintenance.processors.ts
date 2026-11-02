import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { JobProcessorRegistry, type JobProcessor } from '../../jobs/processor.registry.js';
import {
  DUE_SOON_MAX_ASSIGNMENTS,
  DUE_SOON_WINDOW_MS,
  RETENTION,
} from '../notification.constants.js';
import { DueSoonNotifier } from './event-notification.processors.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * maintenance:due-soon (RF-53). Cada hora busca las tareas vigentes que vencen dentro de las
 * próximas 24 h (período abierto, año activo, curso-sección y sección activos) y avisa a quienes
 * aún no entregan. El dedupeKey incluye el plazo: cada estudiante recibe un solo aviso por plazo.
 */
@Injectable()
export class DueSoonSweepProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'due-soon';
  readonly everyMs = HOUR_MS;
  private readonly logger = new Logger(DueSoonSweepProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly prisma: PrismaService,
    private readonly dueSoon: DueSoonNotifier,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ assignments: number; created: number }> {
    const now = new Date();
    const rows = await this.prisma.assignment.findMany({
      where: {
        deletedAt: null,
        dueAt: { gt: now, lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) },
        period: { closedAt: null },
        courseSection: {
          isActive: true,
          section: { isActive: true, academicYear: { isActive: true, closedAt: null } },
        },
      },
      select: { id: true },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: DUE_SOON_MAX_ASSIGNMENTS,
    });
    let created = 0;
    for (const a of rows) created += (await this.dueSoon.notify(a.id, now)).created;
    if (created > 0) this.logger.log(`Avisos por vencer: ${rows.length} tareas, ${created} avisos`);
    return { assignments: rows.length, created };
  }
}

export type RetentionResult = {
  deletedRead: number;
  deletedUnread: number;
  deletedExpired: number;
  emailsSkipped: number;
};

/**
 * maintenance:notification-retention (INFORME 5, hallazgo 1). Una vez al día:
 * - borra las leídas con más de 90 días y las no leídas con más de 180 días;
 * - borra cualquier aviso con más de 365 días (tope);
 * - pasa a SKIPPED los correos PENDING o FAILED con más de 7 días.
 * Trabaja en lotes de 1000 y deja una sola entrada en la bitácora, solo con conteos.
 */
@Injectable()
export class NotificationRetentionProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'notification-retention';
  readonly everyMs = DAY_MS;
  private readonly logger = new Logger(NotificationRetentionProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<RetentionResult> {
    return this.run(new Date());
  }

  async run(now: Date): Promise<RetentionResult> {
    const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const result: RetentionResult = {
      deletedRead: await this.deleteInBatches({
        readAt: { not: null },
        createdAt: { lt: ago(RETENTION.readDays) },
      }),
      deletedUnread: await this.deleteInBatches({
        readAt: null,
        createdAt: { lt: ago(RETENTION.unreadDays) },
      }),
      deletedExpired: await this.deleteInBatches({ createdAt: { lt: ago(RETENTION.maxDays) } }),
      emailsSkipped: await this.skipStaleEmails(ago(RETENTION.emailRetryDays)),
    };
    const total = Object.values(result).reduce((s, n) => s + n, 0);
    if (total > 0) {
      try {
        await this.audit.record({
          module: 'notifications',
          action: 'notification.retention',
          entityType: 'Notification',
          afterState: result,
        });
      } catch (error) {
        this.logger.error(
          `Fallo al registrar la bitácora (${error instanceof Error ? error.name : typeof error})`,
        );
      }
      this.logger.log(`Retención de avisos: ${JSON.stringify(result)}`);
    }
    return result;
  }

  private async deleteInBatches(where: Prisma.NotificationWhereInput): Promise<number> {
    let total = 0;
    for (;;) {
      const ids = await this.prisma.notification.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: RETENTION.batch,
      });
      if (ids.length === 0) break;
      const res = await this.prisma.notification.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });
      total += res.count;
      if (ids.length < RETENTION.batch) break;
    }
    return total;
  }

  private async skipStaleEmails(cutoff: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const ids = await this.prisma.notification.findMany({
        where: { emailStatus: { in: ['PENDING', 'FAILED'] }, createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: RETENTION.batch,
      });
      if (ids.length === 0) break;
      const res = await this.prisma.notification.updateMany({
        where: { id: { in: ids.map((r) => r.id) }, emailStatus: { in: ['PENDING', 'FAILED'] } },
        data: { emailStatus: 'SKIPPED', emailSentAt: null },
      });
      total += res.count;
      if (ids.length < RETENTION.batch) break;
    }
    return total;
  }
}
