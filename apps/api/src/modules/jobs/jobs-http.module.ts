import { Module } from '@nestjs/common';
import { JobDownloadService } from './job-download.service.js';
import { AdminJobsController } from './jobs.controller.js';
import { JobsModule } from './jobs.module.js';

// HTTP de los trabajos (GET /admin/jobs/:id, POST /admin/jobs/:id/download-url). Separado de
// JobsModule para que el worker (sin HTTP) no cargue controladores ni guards. Solo en AppModule.
@Module({
  imports: [JobsModule],
  controllers: [AdminJobsController],
  providers: [JobDownloadService],
  exports: [JobDownloadService],
})
export class JobsHttpModule {}
