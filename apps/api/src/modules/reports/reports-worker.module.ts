import { Module } from '@nestjs/common';
import { AcademicModule } from '../academic/academic.module.js';
import { GradingModule } from '../grading/grading.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { StorageModule } from '../storage/index.js';
import { logoStorageProviders } from '../settings/institution-logo.storage.js';
import { GotenbergClient, PDF_RENDERER } from './gotenberg.client.js';
import { BulkExportProcessor } from './processors/bulk-export.processor.js';
import { SectionExportProcessor } from './processors/section-export.processor.js';
import { ReportRendererService } from './report-renderer.service.js';
import { ReportsDataService } from './reports-data.service.js';

// Procesadores de reportes (Dev 5, RF-58, RF-59), solo en el worker (WorkerModule). El logo se
// lee con InstitutionLogoStorage y el PDF lo hace Gotenberg (GOTENBERG_URL).
@Module({
  imports: [JobsModule, AcademicModule, GradingModule, StorageModule],
  providers: [
    ...logoStorageProviders,
    ReportsDataService,
    { provide: PDF_RENDERER, useClass: GotenbergClient },
    ReportRendererService,
    SectionExportProcessor,
    BulkExportProcessor,
  ],
})
export class ReportsWorkerModule {}
