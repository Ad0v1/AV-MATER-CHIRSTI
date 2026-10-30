import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { ContentsEventPublisher } from './contents-events.js';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';

// Contenidos de Dev 3 (RF-26..31): tareas (fase 3c) y materiales (fase 3e).
// Registrado vacío por el orquestador al abrir Dev 3 (29/10/2026) para que las fases trabajen en paralelo.
// PrismaModule y AuditModule son globales. ContentsEventPublisher se exporta para que Dev 5 se
// suscriba y para que materiales (3e) publique material.published.v1 con la misma instancia.
@Module({
  imports: [AcademicModule],
  controllers: [AssignmentsController, MaterialsController],
  providers: [AssignmentsService, MaterialsService, ContentsEventPublisher],
  exports: [ContentsEventPublisher, AssignmentsService],
})
export class ContentsModule {}
