import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { GradebookReadService } from './gradebook-read.service.js';
import { GradesService } from './grades.service.js';
import { GradingEventPublisher } from './grading-events.js';
import { GradingController } from './grading.controller.js';
import { NeMaterializer } from './ne-materializer.service.js';

// Calificaciones de Dev 4 (RF-41..52, RN-01..07). Registrado por el orquestador (30/10/2026).
// Motor de notas en @aula/shared (Decisión del orquestador 3). PrismaModule y AuditModule son
// globales. Exporta GradebookReadService (reportes de Dev 5) y GradingEventPublisher
// (grade.updated.v1, notificaciones RF-53).
@Module({
  imports: [AcademicModule, SubmissionsModule],
  controllers: [GradingController],
  providers: [GradesService, GradebookReadService, NeMaterializer, GradingEventPublisher],
  exports: [GradebookReadService, GradingEventPublisher],
})
export class GradingModule {}
