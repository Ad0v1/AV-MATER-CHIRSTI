import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import { JobProcessorRegistry, type JobProcessor } from '../../jobs/processor.registry.js';
import { DUE_SOON_WINDOW_MS, NOTIFICATION_JOBS } from '../notification.constants.js';
import { NotificationFanout, type FanoutResult } from './notification-fanout.service.js';
import { NotificationRecipients } from './notification-recipients.service.js';

// Procesadores de la cola `notifications` que encolan los listeners de la API (RF-53, U2). Cada
// uno valida que el dato sea un uuid, vuelve a leer la entidad (puede haber cambiado o
// desaparecido desde el evento) y delega en NotificationFanout. Repetirlos no duplica avisos.

const uuid = z.uuid();

/** Id del trabajo validado; un dato inválido no se reintenta. */
export function jobUuid(data: Record<string, unknown>, key: string): string {
  const parsed = uuid.safeParse(data[key]);
  if (!parsed.success) throw new UnrecoverableError('INVALID_DATA');
  return parsed.data;
}

const EMPTY: FanoutResult = { recipients: 0, created: 0, emailJobs: 0 };

/**
 * Aviso "por vencer" de una tarea (ASSIGNMENT_DUE_SOON): solo si vence dentro de las próximas
 * 24 h, a los estudiantes que aún no entregan y a sus apoderados. La variante es el plazo en
 * segundos: si el docente mueve el plazo, el aviso se repite una vez para el nuevo plazo.
 */
@Injectable()
export class DueSoonNotifier {
  constructor(
    private readonly recipients: NotificationRecipients,
    private readonly fanout: NotificationFanout,
  ) {}

  async notify(assignmentId: string, now: Date): Promise<FanoutResult> {
    const a = await this.recipients.assignment(assignmentId);
    if (!a) return EMPTY;
    const left = a.dueAt.getTime() - now.getTime();
    if (left <= 0 || left > DUE_SOON_WINDOW_MS) return EMPTY;
    const to = await this.recipients.forAssignment(a, true);
    const variant = String(Math.floor(a.dueAt.getTime() / 1000));
    return this.fanout.notify('ASSIGNMENT_DUE_SOON', a.id, to, variant);
  }
}

/** notifications:assignment-created → ASSIGNMENT_CREATED a la sección y sus apoderados. */
@Injectable()
export class AssignmentCreatedProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = NOTIFICATION_JOBS.assignmentCreated;

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly recipients: NotificationRecipients,
    private readonly fanout: NotificationFanout,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(job: Job): Promise<FanoutResult> {
    const a = await this.recipients.assignment(jobUuid(job.data, 'assignmentId'));
    if (!a) return EMPTY;
    const to = await this.recipients.forAssignment(a);
    return this.fanout.notify('ASSIGNMENT_CREATED', a.id, to);
  }
}

/** notifications:assignment-due-check (plazo cambiado) → aviso "por vencer" si corresponde. */
@Injectable()
export class AssignmentDueCheckProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = NOTIFICATION_JOBS.assignmentDueCheck;

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly dueSoon: DueSoonNotifier,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job): Promise<FanoutResult> {
    return this.dueSoon.notify(jobUuid(job.data, 'assignmentId'), new Date());
  }
}

/** notifications:grade-published (nota MANUAL) → GRADE_PUBLISHED al estudiante y apoderados. */
@Injectable()
export class GradePublishedProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = NOTIFICATION_JOBS.gradePublished;

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly recipients: NotificationRecipients,
    private readonly fanout: NotificationFanout,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(job: Job): Promise<FanoutResult> {
    const found = await this.recipients.forGrade(jobUuid(job.data, 'gradeId'));
    if (!found) return EMPTY;
    return this.fanout.notify('GRADE_PUBLISHED', found.entityId, found.recipients);
  }
}

/** notifications:announcement-published → ANNOUNCEMENT_PUBLISHED según el alcance. */
@Injectable()
export class AnnouncementPublishedProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'notifications' as const;
  readonly name = NOTIFICATION_JOBS.announcementPublished;

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly recipients: NotificationRecipients,
    private readonly fanout: NotificationFanout,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(job: Job): Promise<FanoutResult> {
    const id = jobUuid(job.data, 'announcementId');
    const to = await this.recipients.forAnnouncement(id);
    if (!to) return EMPTY;
    return this.fanout.notify('ANNOUNCEMENT_PUBLISHED', id, to);
  }
}
