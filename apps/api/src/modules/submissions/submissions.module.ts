import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { ContentsModule } from '../contents/contents.module.js';
import { SubmissionsReadService } from './submissions-read.service.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

// Entregas de Dev 3 (RF-33, RF-36..39): entregas, reentregas, tardías, historial y constancia; exporta SubmissionsReadService para Dev 4. Fase 3d.
// Registrado vacío por el orquestador al abrir Dev 3 (29/10/2026) para que las fases trabajen en paralelo.
// ContentsModule aporta ContentsEventPublisher: submission.accepted.v1 va por el mismo publicador.
@Module({
  imports: [AcademicModule, ContentsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsReadService],
  exports: [SubmissionsReadService],
})
export class SubmissionsModule {}
