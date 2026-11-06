import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { AnnouncementEventPublisher } from './announcements-events.js';
import {
  AnnouncementsController,
  CourseSectionAnnouncementsController,
  MeAnnouncementsController,
} from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

// Anuncios de Dev 5 (RF-32). AcademicAccessService de Dev 2 resuelve el año activo, la asignación
// del docente y los vínculos del apoderado. PrismaModule y AuditModule son globales. Exporta
// AnnouncementEventPublisher para que notificaciones (RF-53) escuche announcement.published.v1.
// Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  imports: [AcademicModule],
  controllers: [
    CourseSectionAnnouncementsController,
    AnnouncementsController,
    MeAnnouncementsController,
  ],
  providers: [AnnouncementsService, AnnouncementEventPublisher],
  exports: [AnnouncementEventPublisher],
})
export class AnnouncementsModule {}
