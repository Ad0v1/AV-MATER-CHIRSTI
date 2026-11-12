import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AnnouncementEventPublisher } from '../announcements/announcements-events.js';
import { ContentsEventPublisher } from '../contents/contents-events.js';
import { GradingEventPublisher } from '../grading/grading-events.js';
import { type JobData, QueueService } from '../queue/index.js';
import { NOTIFICATION_JOBS } from './notification.constants.js';

/**
 * Puente de eventos en proceso (D-031) a la cola `notifications` (U2), solo en la API. Cada
 * evento encola un trabajo con jobId fijo: si el evento llega dos veces, BullMQ no lo duplica
 * mientras lo conserve, y el dedupeKey de Notification cubre el resto. Solo ids y números.
 * Si Redis no responde, el aviso se pierde (sin outbox, U2); el barrido due-soon cubre los plazos.
 * - assignment.created.v1 → assignment-created.
 * - assignment.updated.v1 con `dueAt` cambiado → assignment-due-check (avisa si vence en 24 h).
 * - grade.updated.v1 con source MANUAL → grade-published (la NE automática no avisa).
 * - announcement.published.v1 → announcement-published.
 */
@Injectable()
export class NotificationEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventsListener.name);
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly queues: QueueService,
    private readonly contents: ContentsEventPublisher,
    private readonly grading: GradingEventPublisher,
    private readonly announcements: AnnouncementEventPublisher,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = [
      this.contents.on('assignment.created.v1', ({ payload }) =>
        this.enqueue(
          NOTIFICATION_JOBS.assignmentCreated,
          { assignmentId: payload.assignmentId },
          `assignment-created-${payload.assignmentId}`,
        ),
      ),
      this.contents.on('assignment.updated.v1', ({ payload }) => {
        if (!payload.changedFields.includes('dueAt')) return;
        const dueAtMs = new Date(payload.dueAt).getTime();
        if (!Number.isFinite(dueAtMs)) return;
        return this.enqueue(
          NOTIFICATION_JOBS.assignmentDueCheck,
          { assignmentId: payload.assignmentId, dueAtMs },
          `assignment-due-${payload.assignmentId}-${dueAtMs}`,
        );
      }),
      this.grading.on('grade.updated.v1', ({ payload }) => {
        if (payload.source !== 'MANUAL') return;
        return this.enqueue(
          NOTIFICATION_JOBS.gradePublished,
          { gradeId: payload.gradeId },
          `grade-published-${payload.gradeId}`,
        );
      }),
      this.announcements.on('announcement.published.v1', ({ payload }) =>
        this.enqueue(
          NOTIFICATION_JOBS.announcementPublished,
          { announcementId: payload.announcementId },
          `announcement-published-${payload.announcementId}`,
        ),
      ),
    ];
  }

  onModuleDestroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  /** Nunca lanza: el evento ya se publicó después del commit y no debe afectar la respuesta. */
  private async enqueue(name: string, data: JobData, jobId: string): Promise<void> {
    try {
      await this.queues.enqueue('notifications', name, data, { jobId });
    } catch (error) {
      // Solo el nombre del error (RNF-09): el mensaje de ioredis puede traer la URL.
      const kind = error instanceof Error ? error.name : typeof error;
      this.logger.warn(`No se pudo encolar ${name} (${kind})`);
    }
  }
}
