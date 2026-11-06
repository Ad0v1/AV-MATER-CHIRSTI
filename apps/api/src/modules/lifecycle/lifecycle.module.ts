import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { LifecycleController } from './lifecycle.controller.js';
import { LifecycleService } from './lifecycle.service.js';
import { YearClosedListener } from './year-closed.listener.js';

// Ciclo de vida en la API (Dev 5, RF-63, RF-65..67): solicitudes, listados y el listener del
// cierre de año. Los procesadores van en LifecycleWorkerModule (solo worker). PrismaModule y
// AuditModule son globales. Registrado en AppModule con autorización del usuario (30/10/2026).
@Module({
  imports: [JobsModule, AcademicModule],
  controllers: [LifecycleController],
  providers: [LifecycleService, YearClosedListener],
  exports: [LifecycleService],
})
export class LifecycleModule {}
