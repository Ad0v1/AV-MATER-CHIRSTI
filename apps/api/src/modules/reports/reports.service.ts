import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Actor } from '../academic/request-user.js';
import { BackgroundJobService, type JobView } from '../jobs/index.js';
import { LiteralScaleProvider } from '../settings/literal-scale.provider.js';
import {
  aggregateDashboard,
  type DashboardAggregate,
  type DashboardInput,
} from './dashboard-aggregate.js';
import type { CourseSectionsQuery, DashboardQuery, ExportRequest } from './reports.dto.js';
import { recordExportRequest } from './reports-audit.js';
import {
  MAX_DASHBOARD_UNFILTERED,
  MAX_REPORT_COURSE_SECTIONS,
  REPORT_ERRORS,
  ReportsDataService,
} from './reports-data.service.js';

// Reportes institucionales del ADMIN (RF-57..60). Los permisos (rol ADMIN activo) los pone el
// controlador. Las exportaciones solo se encolan (BackgroundJobService: JOB_LIMIT 429 y 503 si
// Redis no responde); el worker genera el archivo (exports:section-export y exports:bulk-export).

export interface ReportCourseSectionsView {
  academicYear: { id: string; year: number; isActive: boolean; closedAt: string | null } | null;
  years: { id: string; year: number; isActive: boolean }[];
  periods: { id: string; label: string; sequence: number }[];
  sections: { id: string; gradeLevel: number; code: string }[];
  items: {
    courseSectionId: string;
    isActive: boolean;
    course: { id: string; name: string };
    section: { id: string; gradeLevel: number; code: string };
    teacher: { id: string; fullName: string } | null;
  }[];
}

export interface ReportsDashboardView extends DashboardAggregate {
  academicYear: { id: string; year: number };
  period: { id: string; label: string; sequence: number };
}

export interface ExportAccepted {
  jobId: string;
  job: JobView;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: ReportsDataService,
    private readonly jobs: BackgroundJobService,
    private readonly scales: LiteralScaleProvider,
    private readonly audit: AuditService,
  ) {}

  /** RF-57: cursos-sección del año con su docente, filtrables por grado y sección. */
  async courseSections(query: CourseSectionsQuery): Promise<ReportCourseSectionsView> {
    const years = await this.prisma.academicYear.findMany({
      select: { id: true, year: true, isActive: true, closedAt: true },
      orderBy: { year: 'desc' },
    });
    const year = query.academicYearId
      ? years.find((y) => y.id === query.academicYearId)
      : (years.find((y) => y.isActive === true) ?? years[0]);
    if (query.academicYearId && !year) throw new NotFoundException(REPORT_ERRORS.yearNotFound);
    const yearList = years.map((y) => ({ id: y.id, year: y.year, isActive: y.isActive === true }));
    if (!year) return { academicYear: null, years: yearList, periods: [], sections: [], items: [] };

    const [periods, sections, items] = await Promise.all([
      this.prisma.academicPeriod.findMany({
        where: { academicYearId: year.id },
        select: { id: true, label: true, sequence: true },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.section.findMany({
        where: { academicYearId: year.id },
        select: { id: true, gradeLevel: true, code: true },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
      }),
      this.data.courseSections(year.id, {
        gradeLevel: query.gradeLevel,
        sectionId: query.sectionId,
      }),
    ]);
    return {
      academicYear: {
        id: year.id,
        year: year.year,
        isActive: year.isActive === true,
        closedAt: year.closedAt?.toISOString() ?? null,
      },
      years: yearList,
      periods,
      sections,
      items: items.map((cs) => ({
        courseSectionId: cs.id,
        isActive: cs.isActive,
        course: cs.course,
        section: { id: cs.section.id, gradeLevel: cs.section.gradeLevel, code: cs.section.code },
        teacher: cs.teacher,
      })),
    };
  }

  /**
   * RF-60: promedios por grado y sección, distribución por literal, estudiantes en riesgo
   * (conteos, sin nombres) y entregas a tiempo, tarde y NE del período. Todo sale del motor por
   * curso-sección (aggregateDashboard no recalcula). Sin promedio anual (D-014).
   */
  async dashboard(query: DashboardQuery, now: Date = new Date()): Promise<ReportsDashboardView> {
    const year = await this.data.year(query.academicYearId);
    const period = await this.data.period(year.id, query.periodId);
    const refs = await this.data.courseSections(year.id, { gradeLevel: query.gradeLevel });
    if (refs.length > MAX_REPORT_COURSE_SECTIONS) {
      throw new UnprocessableEntityException(REPORT_ERRORS.tooMany);
    }
    if (query.gradeLevel === undefined && refs.length > MAX_DASHBOARD_UNFILTERED) {
      throw new UnprocessableEntityException(REPORT_ERRORS.needsGradeFilter);
    }
    const scale = await this.scales.current();
    const items: DashboardInput[] = [];
    for (const ref of refs) {
      const { view } = await this.data.sectionGradebook(ref.id, period.id, now);
      items.push({
        gradeLevel: ref.section.gradeLevel,
        sectionId: ref.section.id,
        code: ref.section.code,
        students: view.students.map((s) => ({
          studentId: s.studentId,
          atRisk: s.atRisk,
          cells: s.cells,
        })),
        dashboard: view.dashboard,
      });
    }
    return {
      academicYear: { id: year.id, year: year.year },
      period: { id: period.id, label: period.label, sequence: period.sequence },
      ...aggregateDashboard(items, scale),
    };
  }

  /** RF-58 y RF-59: valida, encola y deja bitácora. 202 con el id del trabajo. */
  async requestExport(body: ExportRequest, actor: Actor): Promise<ExportAccepted> {
    if (body.type === 'SECTION_EXPORT') {
      const cs = await this.prisma.courseSection.findUnique({
        where: { id: body.courseSectionId },
        select: { section: { select: { academicYearId: true } } },
      });
      if (!cs) throw new NotFoundException(REPORT_ERRORS.courseSectionNotFound);
      const academicYearId = cs.section.academicYearId;
      await this.data.period(academicYearId, body.periodId);
      const job = await this.jobs.create({
        type: 'SECTION_EXPORT',
        params: {
          courseSectionId: body.courseSectionId,
          periodId: body.periodId,
          academicYearId,
          format: body.format,
        },
        requestedById: actor.id,
      });
      await recordExportRequest(
        this.audit,
        actor,
        { type: 'CourseSection', id: body.courseSectionId },
        { jobId: job.id, type: job.type, format: body.format, periodId: body.periodId },
      );
      return { jobId: job.id, job };
    }

    const year = await this.data.year(body.academicYearId);
    await this.data.period(year.id, body.periodId);
    const count = await this.data.countCourseSections(year.id);
    if (count === 0) {
      throw new UnprocessableEntityException({
        code: 'NO_COURSE_SECTIONS',
        message: 'El año no tiene cursos-sección.',
      });
    }
    if (count > MAX_REPORT_COURSE_SECTIONS) {
      throw new UnprocessableEntityException(REPORT_ERRORS.tooMany);
    }
    const job = await this.jobs.create({
      type: 'BULK_EXPORT',
      params: { academicYearId: year.id, periodId: body.periodId, format: body.format },
      requestedById: actor.id,
    });
    await recordExportRequest(
      this.audit,
      actor,
      { type: 'AcademicYear', id: year.id },
      { jobId: job.id, type: job.type, format: body.format, periodId: body.periodId, count },
    );
    return { jobId: job.id, job };
  }
}
