import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { GradingModule } from '../grading/grading.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsDataService } from './reports-data.service.js';
import { ReportsService } from './reports.service.js';

// Reportes en la API (Dev 5, RF-57..60): listado, dashboard y solicitud de exportaciones. Los
// procesadores van en ReportsWorkerModule (solo worker). LiteralScaleProvider, PrismaModule y
// AuditModule son globales. Registrado en AppModule (autorización de la Decisión 1).
@Module({
  imports: [JobsModule, AcademicModule, GradingModule],
  controllers: [ReportsController],
  providers: [ReportsDataService, ReportsService],
})
export class ReportsModule {}
