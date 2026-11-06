import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { NotificationType } from '../../../generated/prisma/enums.js';
import { deliverableEmail } from '../../jobs/mailer.service.js';
import { QueueService } from '../../queue/index.js';
import {
  dedupeKey,
  EMAIL_BATCH,
  INSERT_CHUNK,
  NOTIFICATION_JOBS,
} from '../notification.constants.js';

export type FanoutResult = { recipients: number; created: number; emailJobs: number };

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Crea los avisos de un evento (RF-53) y encola sus correos. Idempotente: el dedupeKey único
 * hace que repetir el trabajo no duplique avisos (createMany con skipDuplicates) y el jobId de
 * cada lote de correo sale de sus ids. Solo destinatarios ACTIVE; sin correo válido, el aviso
 * queda en la plataforma con emailStatus SKIPPED (U3: del apoderado solo se usa el correo si
 * existe). Los correos van en lotes de EMAIL_BATCH ids (INFORME 5).
 */
@Injectable()
export class NotificationFanout {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async notify(
    type: NotificationType,
    entityId: string,
    recipientIds: string[],
    variant?: string,
  ): Promise<FanoutResult> {
    const unique = [...new Set(recipientIds)];
    if (unique.length === 0) return { recipients: 0, created: 0, emailJobs: 0 };

    const keys: string[] = [];
    let created = 0;
    for (const part of chunks(unique, INSERT_CHUNK)) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: part }, status: 'ACTIVE' },
        select: { id: true, contactEmail: true, emailVerifiedAt: true },
      });
      const rows = users.map((u) => {
        const key = dedupeKey(type, entityId, u.id, variant);
        keys.push(key);
        return {
          recipientId: u.id,
          type,
          entityId,
          dedupeKey: key,
          emailStatus: deliverableEmail(u) ? ('PENDING' as const) : ('SKIPPED' as const),
        };
      });
      if (rows.length === 0) continue;
      const res = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });
      created += res.count;
    }

    // Correos pendientes de este evento (también los de una corrida anterior que falló a medias).
    const pending: string[] = [];
    for (const part of chunks(keys, INSERT_CHUNK)) {
      const rows = await this.prisma.notification.findMany({
        where: { dedupeKey: { in: part }, emailStatus: 'PENDING' },
        select: { id: true },
      });
      pending.push(...rows.map((r) => r.id));
    }
    pending.sort();
    const batches = chunks(pending, EMAIL_BATCH);
    for (const notificationIds of batches) {
      const digest = createHash('sha256').update(notificationIds.join(',')).digest('hex');
      await this.queues.enqueue(
        'notifications',
        NOTIFICATION_JOBS.sendEmail,
        { notificationIds },
        { jobId: `send-email-${digest.slice(0, 48)}` },
      );
    }
    return { recipients: unique.length, created, emailJobs: batches.length };
  }
}
