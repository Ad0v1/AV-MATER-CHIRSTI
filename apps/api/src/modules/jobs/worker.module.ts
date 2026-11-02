import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { PrismaModule } from '../../common/prisma/prisma.module.js';
import { ConfigModule } from '../../config/config.module.js';
import { FilesModule } from '../files/files.module.js';
import { GradingModule } from '../grading/grading.module.js';
import { JobsModule } from './jobs.module.js';
import { IntentSweepProcessor } from './processors/intent-sweep.processor.js';
import { MailCheckProcessor } from './processors/mail-check.processor.js';
import { NeSweepProcessor } from './processors/ne-sweep.processor.js';
import { ResultExpiryProcessor } from './processors/result-expiry.processor.js';
import { workerHostProviders } from './worker.host.js';

// Raiz del proceso worker (worker.main.ts, U1): sin HTTP, sesiones ni guards. Cada fase de
// Dev 5 agrega aqui su modulo de procesadores (5c..5g). Los procesadores se registran solos
// en JobProcessorRegistry (onModuleInit) y WorkerHost los consume.
@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, JobsModule, GradingModule, FilesModule],
  providers: [
    NeSweepProcessor,
    IntentSweepProcessor,
    ResultExpiryProcessor,
    MailCheckProcessor,
    ...workerHostProviders,
  ],
})
export class WorkerModule {}
