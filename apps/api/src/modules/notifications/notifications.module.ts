import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { AnnouncementsModule } from '../announcements/announcements.module.js';
import { ContentsModule } from '../contents/contents.module.js';
import { GradingModule } from '../grading/grading.module.js';
import { QueueModule } from '../queue/index.js';
import { NotificationEventsListener } from './notification-events.listener.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

// Avisos de Dev 5 en la API (RF-53): bandeja /me/notifications y el puente de eventos a la cola
// `notifications` (U2). Los procesadores viven en NotificationsWorkerModule (solo el worker).
// Importa los módulos dueños de los publicadores para suscribirse a la misma instancia.
// Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  imports: [AcademicModule, QueueModule, ContentsModule, GradingModule, AnnouncementsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEventsListener],
})
export class NotificationsModule {}
