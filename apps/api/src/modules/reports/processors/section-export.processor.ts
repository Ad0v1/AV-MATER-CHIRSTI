import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  buildResultKey,
  JobError,
  JobProcessorRegistry,
  type JobProcessor,
  type JobResult,
  JobResultStorage,
  type StartedJob,
  type TrackedJobData,
  TrackedJobRunner,
} from '../../jobs/index.js';
import { FORMAT_EXT, isReportFormat, ReportRendererService } from '../report-renderer.service.js';

/**
 * exports:section-export (RF-58). Registro de un curso-sección y período en XLSX (exceljs) o PDF
 * (Gotenberg), con la cabecera institucional. Se sube a exports/ y vence a los EXPORT_TTL_DAYS (U6).
 */
@Injectable()
export class SectionExportProcessor implements JobProcessor<TrackedJobData>, OnModuleInit {
  readonly queue = 'exports' as const;
  readonly name = 'section-export';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly runner: TrackedJobRunner,
    private readonly renderer: ReportRendererService,
    private readonly results: JobResultStorage,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job<TrackedJobData>): Promise<void> {
    return this.runner.run(job, (started) => this.work(started));
  }

  async work(started: StartedJob, now: Date = new Date()): Promise<JobResult> {
    const { courseSectionId, periodId, format } = started.params;
    if (
      typeof courseSectionId !== 'string' ||
      typeof periodId !== 'string' ||
      !isReportFormat(format)
    ) {
      throw new JobError('INVALID_PARAMS', false);
    }
    const institution = await this.renderer.institution();
    const data = await this.renderer.sectionData(courseSectionId, periodId, institution, now);
    const file = await this.renderer.render(data, format);
    const objectKey = buildResultKey(FORMAT_EXT[format], now);
    const bytes = await this.results.upload(objectKey, file);
    return { objectKey, bytes };
  }
}
