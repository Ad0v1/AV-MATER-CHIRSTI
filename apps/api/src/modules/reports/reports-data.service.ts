import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { GradebookReadService } from '../grading/gradebook-read.service.js';
import type { GradebookView } from '../grading/grading.types.js';

// Lecturas comunes de los reportes (RF-57..60) para la API y el worker. Los datos de notas salen
// siempre de GradebookReadService.buildCourseSectionGradebook (motor de packages/shared): aquí no
// se recalcula nada. ADVERTENCIA: no comprueba permisos; solo lo usan rutas ADMIN y el worker.

/** Tope de cursos-sección de una exportación masiva (RF-59) y del dashboard (RF-60). */
export const MAX_REPORT_COURSE_SECTIONS = 300;

/** Sin filtro de grado, el dashboard solo recorre años de hasta este tamaño (seguridad 5f). */
export const MAX_DASHBOARD_UNFILTERED = 60;

export const REPORT_ERRORS = {
  yearNotFound: { code: 'YEAR_NOT_FOUND', message: 'El año escolar no existe.' },
  periodNotFound: { code: 'PERIOD_NOT_FOUND', message: 'El período no existe.' },
  periodMismatch: {
    code: 'PERIOD_MISMATCH',
    message: 'El período no pertenece al año del curso.',
  },
  courseSectionNotFound: {
    code: 'COURSE_SECTION_NOT_FOUND',
    message: 'El curso-sección no existe.',
  },
  needsGradeFilter: {
    code: 'REPORT_NEEDS_GRADE_FILTER',
    message: `El año tiene más de ${MAX_DASHBOARD_UNFILTERED} cursos-sección; elige un grado.`,
  },
  tooMany: {
    code: 'REPORT_TOO_LARGE',
    message: `El año tiene más de ${MAX_REPORT_COURSE_SECTIONS} cursos-sección; filtra por grado.`,
  },
} as const;

export interface CourseSectionRef {
  id: string;
  isActive: boolean;
  course: { id: string; name: string };
  section: { id: string; gradeLevel: number; code: string; isActive: boolean };
  teacher: { id: string; fullName: string } | null;
}

export interface SectionGradebook {
  view: GradebookView;
  year: number;
  teacher: { id: string; fullName: string } | null;
}

@Injectable()
export class ReportsDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademicAccessService,
    private readonly gradebook: GradebookReadService,
  ) {}

  /** Año existente; 404 YEAR_NOT_FOUND. */
  async year(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, year: true, isActive: true, closedAt: true },
    });
    if (!year) throw new NotFoundException(REPORT_ERRORS.yearNotFound);
    return year;
  }

  /** Período del año; 404 si no existe, 422 si es de otro año. */
  async period(academicYearId: string, periodId: string) {
    const period = await this.prisma.academicPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, label: true, sequence: true, academicYearId: true },
    });
    if (!period) throw new NotFoundException(REPORT_ERRORS.periodNotFound);
    if (period.academicYearId !== academicYearId) {
      throw new UnprocessableEntityException(REPORT_ERRORS.periodMismatch);
    }
    return period;
  }

  /** Cursos-sección del año, por grado, sección y curso. */
  courseSections(
    academicYearId: string,
    filter: { gradeLevel?: number; sectionId?: string } = {},
  ): Promise<CourseSectionRef[]> {
    return this.prisma.courseSection.findMany({
      where: {
        ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
        section: {
          academicYearId,
          ...(filter.gradeLevel !== undefined ? { gradeLevel: filter.gradeLevel } : {}),
        },
      },
      select: {
        id: true,
        isActive: true,
        course: { select: { id: true, name: true } },
        section: { select: { id: true, gradeLevel: true, code: true, isActive: true } },
        teacher: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { section: { gradeLevel: 'asc' } },
        { section: { code: 'asc' } },
        { course: { name: 'asc' } },
      ],
    });
  }

  countCourseSections(academicYearId: string): Promise<number> {
    return this.prisma.courseSection.count({ where: { section: { academicYearId } } });
  }

  /**
   * Registro de un curso-sección en un período (RF-57, RF-58). 404 si el curso-sección no existe;
   * 404 PERIOD_NOT_FOUND si el período no es de su año.
   */
  async sectionGradebook(
    courseSectionId: string,
    periodId: string,
    now: Date = new Date(),
  ): Promise<SectionGradebook> {
    let ctx;
    try {
      ctx = await this.access.getCourseSectionContext(courseSectionId, now);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(REPORT_ERRORS.courseSectionNotFound);
      }
      throw error;
    }
    if (!ctx.periods.some((p) => p.id === periodId)) {
      throw new NotFoundException(REPORT_ERRORS.periodNotFound);
    }
    const view = await this.gradebook.buildCourseSectionGradebook(ctx, periodId, now);
    return { view, year: ctx.academicYear.year, teacher: ctx.teacher };
  }
}
