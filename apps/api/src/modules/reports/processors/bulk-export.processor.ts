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
  uploadZip,
  zipPath,
  zipSegment,
} from '../../jobs/index.js';
import { FORMAT_EXT, isReportFormat, ReportRendererService } from '../report-renderer.service.js';
import { MAX_REPORT_COURSE_SECTIONS, ReportsDataService } from '../reports-data.service.js';
import { sectionText } from '../section-report.js';

/** Largo máximo del nombre base de una entrada (zipSegment corta a 80 con la extensión). */
const ENTRY_BASE_MAX = 70;

/** Recorta primero el nombre base y luego agrega la extensión: nunca se pierde. */
export function entryName(base: string, ext: string): string {
  const cut = Array.from(zipSegment(base)).slice(0, ENTRY_BASE_MAX).join('').trim();
  return `${cut.replace(/[. ]+$/, '') || 'reporte'}.${ext}`;
}

/** Tope del contenido sin comprimir del ZIP masivo (RF-59). */
export const MAX_BULK_BYTES = 200 * 1024 * 1024;

/**
 * exports:bulk-export (RF-59). ZIP en streaming (zip-archive) con un archivo por curso-sección
 * del año y período, agrupados en una carpeta por sección ("3.º A/Matemática - Bimestre 1.xlsx").
 * Topes: MAX_REPORT_COURSE_SECTIONS archivos y MAX_BULK_BYTES sin comprimir; si se pasa, falla
 * con BULK_TOO_LARGE (no reintentable) y no queda objeto en S3.
 */
@Injectable()
export class BulkExportProcessor implements JobProcessor<TrackedJobData>, OnModuleInit {
  readonly queue = 'exports' as const;
  readonly name = 'bulk-export';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly runner: TrackedJobRunner,
    private readonly renderer: ReportRendererService,
    private readonly data: ReportsDataService,
    private readonly results: JobResultStorage,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job<TrackedJobData>): Promise<void> {
    return this.runner.run(job, (started) => this.work(started));
  }

  async work(
    started: StartedJob,
    now: Date = new Date(),
    maxBytes: number = MAX_BULK_BYTES,
  ): Promise<JobResult> {
    const { academicYearId, periodId, format } = started.params;
    if (
      typeof academicYearId !== 'string' ||
      typeof periodId !== 'string' ||
      !isReportFormat(format)
    ) {
      throw new JobError('INVALID_PARAMS', false);
    }
    const refs = await this.data.courseSections(academicYearId);
    if (refs.length === 0) throw new JobError('NO_COURSE_SECTIONS', false);
    if (refs.length > MAX_REPORT_COURSE_SECTIONS) throw new JobError('BULK_TOO_LARGE', false);
    const institution = await this.renderer.institution();
    const objectKey = buildResultKey('zip', now);
    let total = 0;
    const bytes = await uploadZip(this.results, objectKey, async (zip) => {
      for (const ref of refs) {
        const data = await this.renderer.sectionData(ref.id, periodId, institution, now);
        const file = await this.renderer.render(data, format);
        total += file.length;
        if (total > maxBytes) throw new JobError('BULK_TOO_LARGE', false);
        await zip.addBuffer(
          zipPath(
            sectionText(ref.section.gradeLevel, ref.section.code),
            entryName(`${data.course} - ${data.period}`, FORMAT_EXT[format]),
          ),
          file,
        );
      }
    });
    return { objectKey, bytes };
  }
}
