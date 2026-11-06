import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import {
  AnnouncementPublishedProcessor,
  AssignmentCreatedProcessor,
  AssignmentDueCheckProcessor,
  DueSoonNotifier,
  GradePublishedProcessor,
} from './worker/event-notification.processors.js';
import {
  DueSoonSweepProcessor,
  NotificationRetentionProcessor,
} from './worker/maintenance.processors.js';
import { NotificationFanout } from './worker/notification-fanout.service.js';
import { NotificationRecipients } from './worker/notification-recipients.service.js';
import { SendEmailProcessor } from './worker/send-email.processor.js';

// Procesadores de avisos de Dev 5 (RF-53), solo en el worker (WorkerModule). JobsModule aporta
// el registro de procesadores, el correo y la cola. PrismaModule y AuditModule son globales.
@Module({
  imports: [JobsModule],
  providers: [
    NotificationRecipients,
    NotificationFanout,
    DueSoonNotifier,
    AssignmentCreatedProcessor,
    AssignmentDueCheckProcessor,
    GradePublishedProcessor,
    AnnouncementPublishedProcessor,
    SendEmailProcessor,
    DueSoonSweepProcessor,
    NotificationRetentionProcessor,
  ],
})
export class NotificationsWorkerModule {}
