import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { JobError } from '../jobs/index.js';
import { InstitutionLogoStorage } from '../settings/institution-logo.storage.js';
import { PDF_RENDERER, type PdfRenderer } from './gotenberg.client.js';
import { buildSectionHtml } from './report-html.js';
import { buildSectionXlsx } from './report-xlsx.js';
import type { ReportFormat } from './reports.dto.js';
import { ReportsDataService } from './reports-data.service.js';
import {
  LOGO_MIMES,
  type LogoMime,
  type ReportInstitution,
  type SectionReportData,
  toSectionReportData,
} from './section-report.js';

// Arma el archivo de un curso-sección (RF-58) en el worker: datos del motor (ReportsDataService),
// cabecera institucional (InstitutionSettings, logo embebido) y XLSX o PDF. Lo usan
// exports:section-export y exports:bulk-export (RF-59).

export const FORMAT_EXT = { XLSX: 'xlsx', PDF: 'pdf' } as const;

export function isReportFormat(value: unknown): value is ReportFormat {
  return value === 'XLSX' || value === 'PDF';
}

@Injectable()
export class ReportRendererService {
  private readonly logger = new Logger(ReportRendererService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: ReportsDataService,
    private readonly logos: InstitutionLogoStorage,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  /** Nombre y logo de la fila única (U11). Sin logo si falta o S3 falla: el reporte sale igual. */
  async institution(): Promise<ReportInstitution> {
    const row = await this.prisma.institutionSettings.findUnique({
      where: { id: 1 },
      select: { name: true, logoObjectKey: true, logoMime: true },
    });
    const name = row?.name ?? 'Institución educativa';
    const mime = row?.logoMime;
    if (!row?.logoObjectKey || !mime || !(LOGO_MIMES as readonly string[]).includes(mime)) {
      return { name, logo: null };
    }
    try {
      return {
        name,
        logo: { mime: mime as LogoMime, data: await this.logos.download(row.logoObjectKey) },
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el logo; el reporte sale sin él (${error instanceof Error ? error.name : typeof error})`,
      );
      return { name, logo: null };
    }
  }

  /** Datos del reporte; JobError no reintentable si el curso-sección o el período ya no existen. */
  async sectionData(
    courseSectionId: string,
    periodId: string,
    institution: ReportInstitution,
    now: Date,
  ): Promise<SectionReportData> {
    let book;
    try {
      book = await this.data.sectionGradebook(courseSectionId, periodId, now);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || status === 422) throw new JobError('REPORT_SOURCE_NOT_FOUND', false);
      throw error;
    }
    return toSectionReportData(book.view, {
      institution,
      year: book.year,
      teacher: book.teacher?.fullName ?? null,
      now,
    });
  }

  render(data: SectionReportData, format: ReportFormat): Promise<Buffer> {
    return format === 'XLSX' ? buildSectionXlsx(data) : this.pdf.htmlToPdf(buildSectionHtml(data));
  }
}
