import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { LifecycleService } from './lifecycle.service.js';
import { LifecycleSweepProcessor } from './processors/lifecycle-sweep.processor.js';
import { PersonalDataExportProcessor } from './processors/personal-data-export.processor.js';
import { PurgeYearProcessor } from './processors/purge-year.processor.js';
import { YearBackupProcessor } from './processors/year-backup.processor.js';

// Procesadores del ciclo de vida (Dev 5, RF-63, RF-65, RF-66), solo en el worker (WorkerModule).
// FilesModule aporta FileLifecycleService (U12) y StorageService (lectura de los PDF).
// PrismaModule y AuditModule los importa WorkerModule (globales).
@Module({
  imports: [JobsModule, FilesModule],
  providers: [
    LifecycleService,
    PersonalDataExportProcessor,
    YearBackupProcessor,
    PurgeYearProcessor,
    LifecycleSweepProcessor,
  ],
})
export class LifecycleWorkerModule {}
