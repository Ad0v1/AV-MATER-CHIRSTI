import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { MSG as ACADEMIC_MSG } from '../academic/academic.errors.js';
import type { CalendarQuery } from './calendar.dto.js';

// Calendario de plazos (RF-54). Solo tareas publicadas (Assignment sin deletedAt, igual que el
// listado de Dev 3) de los cursos-sección activos del año activo a los que el usuario pertenece:
// - STUDENT: su matrícula vigente (como GET /me/course-sections de Dev 2).
// - TEACHER: sus asignaciones.
// - GUARDIAN: matrícula vigente de sus estudiantes con vínculo vigente (getLinkedStudentIds de
//   Dev 2); con ?studentId solo ese estudiante y 403 si no está vinculado.
// Sin instrucciones, notas ni datos de otros estudiantes. El usuario debe estar ACTIVE.

/** Tope de plazos por respuesta; con más, `truncated` es true (un rango de 62 días no llega). */
export const CALENDAR_MAX_ITEMS = 500;

export type CalendarItem = {
  assignmentId: string;
  title: string;
  dueAt: string;
  allowLate: boolean;
  courseSectionId: string;
  course: { id: string; name: string };
  section: { id: string; gradeLevel: number; code: string };
  /** Solo para GUARDIAN: a cuál de sus estudiantes corresponde el plazo. */
  students?: { id: string; fullName: string }[];
};

export type CalendarView = {
  from: string;
  to: string;
  items: CalendarItem[];
  truncated: boolean;
};

type Scope = {
  courseSectionIds: string[];
  /** GUARDIAN: estudiantes por sección. */
  studentsBySection?: Map<string, { id: string; fullName: string }[]>;
};

/** Cursos-sección y secciones activos del año (mismo filtro que listMine de Dev 2). */
const activeCourseSections = (academicYearId: string) => ({
  isActive: true,
  section: { isActive: true, academicYearId },
});

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademicAccessService,
  ) {}

  async forUser(user: AuthenticatedUser, query: CalendarQuery): Promise<CalendarView> {
    if (query.studentId !== undefined && user.role !== 'GUARDIAN') {
      throw new BadRequestException({
        message: [{ path: 'studentId', message: 'Solo el apoderado puede indicar un estudiante' }],
      });
    }
    await this.assertActive(user.id);
    const empty: CalendarView = {
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      items: [],
      truncated: false,
    };

    const active = await this.access.getActiveYear();
    const scope = active ? await this.scopeOf(user, active.id, query.studentId) : null;
    if (!scope || scope.courseSectionIds.length === 0) return empty;

    const rows = await this.prisma.assignment.findMany({
      where: {
        courseSectionId: { in: scope.courseSectionIds },
        deletedAt: null,
        dueAt: { gte: query.from, lt: query.to },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        allowLate: true,
        courseSectionId: true,
        courseSection: {
          select: {
            course: { select: { id: true, name: true } },
            section: { select: { id: true, gradeLevel: true, code: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: CALENDAR_MAX_ITEMS + 1,
    });

    const items = rows.slice(0, CALENDAR_MAX_ITEMS).map((a): CalendarItem => ({
      assignmentId: a.id,
      title: a.title,
      dueAt: a.dueAt.toISOString(),
      allowLate: a.allowLate,
      courseSectionId: a.courseSectionId,
      course: a.courseSection.course,
      section: a.courseSection.section,
      ...(scope.studentsBySection
        ? { students: scope.studentsBySection.get(a.courseSection.section.id) ?? [] }
        : {}),
    }));
    return { ...empty, items, truncated: rows.length > CALENDAR_MAX_ITEMS };
  }

  private async scopeOf(
    user: AuthenticatedUser,
    academicYearId: string,
    studentId: string | undefined,
  ): Promise<Scope | null> {
    const activeCs = activeCourseSections(academicYearId);
    switch (user.role) {
      case 'TEACHER': {
        const rows = await this.prisma.courseSection.findMany({
          where: { ...activeCs, teacherId: user.id },
          select: { id: true },
        });
        return { courseSectionIds: rows.map((r) => r.id) };
      }
      case 'STUDENT': {
        const sections = await this.currentSections([user.id], academicYearId);
        return {
          courseSectionIds: await this.courseSectionsOf([...sections.keys()], academicYearId),
        };
      }
      case 'GUARDIAN': {
        const linked = await this.access.getLinkedStudentIds(user.id);
        if (studentId !== undefined && !linked.includes(studentId)) {
          throw new ForbiddenException(ACADEMIC_MSG.forbidden);
        }
        const ids = studentId !== undefined ? [studentId] : linked;
        if (ids.length === 0) return null;
        const sections = await this.currentSections(ids, academicYearId);
        return {
          courseSectionIds: await this.courseSectionsOf([...sections.keys()], academicYearId),
          studentsBySection: sections,
        };
      }
      default:
        // ADMIN no tiene calendario propio (el controlador ya responde 403 por rol).
        throw new ForbiddenException(ACADEMIC_MSG.forbidden);
    }
  }

  /** Secciones con matrícula vigente en el año, con sus estudiantes (de la lista dada). */
  private async currentSections(
    studentIds: string[],
    academicYearId: string,
  ): Promise<Map<string, { id: string; fullName: string }[]>> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, academicYearId, isCurrent: true },
      select: { sectionId: true, student: { select: { id: true, fullName: true } } },
      orderBy: { student: { fullName: 'asc' } },
    });
    const bySection = new Map<string, { id: string; fullName: string }[]>();
    for (const r of rows) {
      const list = bySection.get(r.sectionId) ?? [];
      list.push(r.student);
      bySection.set(r.sectionId, list);
    }
    return bySection;
  }

  private async courseSectionsOf(sectionIds: string[], academicYearId: string): Promise<string[]> {
    if (sectionIds.length === 0) return [];
    const rows = await this.prisma.courseSection.findMany({
      where: { ...activeCourseSections(academicYearId), sectionId: { in: sectionIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertActive(userId: string): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (me?.status !== 'ACTIVE') throw new ForbiddenException(ACADEMIC_MSG.forbidden);
  }
}
