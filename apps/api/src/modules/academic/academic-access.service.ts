import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { EnrollmentEndReason, UserStatus } from '../../generated/prisma/enums.js';
import { MSG } from './academic.errors.js';
import { marker, toDateOnly, toIso } from './academic.mappers.js';
import { currentPeriodOf, isYearReadOnly, todayInLima } from './academic-policy.js';

// Contrato para Dev 3/4/5 (Decisión 3 del expediente F2). Las fechas solo-día van como
// 'YYYY-MM-DD' y los timestamps en ISO UTC, igual que en las respuestas HTTP.

export type ActiveYear = { id: string; year: number };

export type PeriodView = {
  id: string;
  academicYearId: string;
  sequence: number;
  kind: string;
  label: string;
  startDate: string;
  endDate: string;
  closedAt: string | null;
  isOpen: boolean;
};

export type CourseSectionContext = {
  id: string;
  isActive: boolean;
  readOnly: boolean;
  academicYear: { id: string; year: number; isActive: boolean; closedAt: string | null };
  section: { id: string; gradeLevel: number; code: string; isActive: boolean };
  course: { id: string; name: string };
  teacher: { id: string; fullName: string } | null;
  periods: PeriodView[];
  currentPeriodId: string | null;
};

export type CurrentEnrollment = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  status: UserStatus;
  effectiveFrom: string;
};

export type StudentEnrollment = {
  enrollmentId: string;
  sectionId: string;
  academicYearId: string;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  endReason: EnrollmentEndReason | null;
};

type YearRow = { id: string; year: number; isActive: boolean | null; closedAt: Date | null };
type PeriodRow = {
  id: string;
  academicYearId: string;
  sequence: number;
  kind: string;
  label: string;
  startDate: Date;
  endDate: Date;
  closedAt: Date | null;
};

/** Un período está abierto si no está cerrado y su año está activo y sin cerrar. */
export const periodIsOpen = (period: { closedAt: Date | null }, year: YearRow): boolean =>
  period.closedAt === null && year.isActive === true && year.closedAt === null;

export function toPeriodView(period: PeriodRow, year: YearRow): PeriodView {
  return {
    id: period.id,
    academicYearId: period.academicYearId,
    sequence: period.sequence,
    kind: period.kind,
    label: period.label,
    startDate: toDateOnly(period.startDate),
    endDate: toDateOnly(period.endDate),
    closedAt: toIso(period.closedAt),
    isOpen: periodIsOpen(period, year),
  };
}

@Injectable()
export class AcademicAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Año activo (RN-11: a lo sumo uno) o null. */
  async getActiveYear(): Promise<ActiveYear | null> {
    return this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, year: true },
    });
  }

  /** Solo lectura (D-030) resolviendo el año activo si hace falta. */
  async isYearReadOnly(year: {
    year: number;
    isActive: boolean | null;
    closedAt: Date | null;
  }): Promise<boolean> {
    const active = year.isActive === true ? year : await this.getActiveYear();
    return isYearReadOnly(year, active);
  }

  /** Contexto de un curso-sección. No comprueba permisos: usar antes assertCanAccessCourseSection. */
  async getCourseSectionContext(
    courseSectionId: string,
    now: Date = new Date(),
  ): Promise<CourseSectionContext> {
    const cs = await this.prisma.courseSection.findUnique({
      where: { id: courseSectionId },
      include: {
        course: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        section: {
          include: {
            academicYear: { include: { periods: { orderBy: { sequence: 'asc' } } } },
          },
        },
      },
    });
    if (!cs) throw new NotFoundException(MSG.courseSectionNotFound);

    const year = cs.section.academicYear;
    const activeYear = year.isActive === true ? year : await this.getActiveYear();
    const periods = year.periods.map((p) => toPeriodView(p, year));
    const readOnly =
      isYearReadOnly(year, activeYear) ||
      year.isActive !== true ||
      !cs.section.isActive ||
      !cs.isActive;

    return {
      id: cs.id,
      isActive: cs.isActive,
      readOnly,
      academicYear: {
        id: year.id,
        year: year.year,
        isActive: marker(year.isActive),
        closedAt: toIso(year.closedAt),
      },
      section: {
        id: cs.section.id,
        gradeLevel: cs.section.gradeLevel,
        code: cs.section.code,
        isActive: cs.section.isActive,
      },
      course: cs.course,
      teacher: cs.teacher,
      periods,
      currentPeriodId: currentPeriodOf(periods, todayInLima(now))?.id ?? null,
    };
  }

  /**
   * Pertenencia al curso-sección: 404 si no existe; 403 si el usuario no está ACTIVE o no
   * pertenece. ADMIN siempre; TEACHER si es el docente asignado; STUDENT con matrícula vigente
   * en la sección; GUARDIAN si algún estudiante vinculado tiene matrícula vigente en la sección.
   */
  async assertCanAccessCourseSection(
    user: AuthenticatedUser,
    courseSectionId: string,
  ): Promise<void> {
    const cs = await this.findCourseSectionOrFail(courseSectionId);
    await this.assertActiveUser(user.id);

    switch (user.role) {
      case 'ADMIN':
        return;
      case 'TEACHER':
        if (cs.teacherId === user.id) return;
        break;
      case 'STUDENT':
        if (await this.hasCurrentEnrollment([user.id], cs.sectionId)) return;
        break;
      case 'GUARDIAN': {
        const students = await this.getLinkedStudentIds(user.id);
        if (await this.hasCurrentEnrollment(students, cs.sectionId)) return;
        break;
      }
    }
    throw new ForbiddenException(MSG.forbidden);
  }

  /** 404 si no existe; 403 si el usuario no es el docente asignado (o no hay docente) o no está ACTIVE. */
  async assertTeacherOf(userId: string, courseSectionId: string): Promise<void> {
    const cs = await this.findCourseSectionOrFail(courseSectionId);
    if (cs.teacherId === null || cs.teacherId !== userId) {
      throw new ForbiddenException(MSG.forbidden);
    }
    await this.assertActiveUser(userId);
  }

  /** 404 si no existe; true solo si el período no está cerrado y su año está activo y sin cerrar. */
  async isPeriodOpen(periodId: string): Promise<boolean> {
    const period = await this.prisma.academicPeriod.findUnique({
      where: { id: periodId },
      include: { academicYear: true },
    });
    if (!period) throw new NotFoundException(MSG.periodNotFound);
    return periodIsOpen(period, period.academicYear);
  }

  /**
   * Se puede escribir en el curso-sección (notas, tareas, materiales): 404 si no existe;
   * 409 si su año no está activo o está cerrado, o si la sección o el curso-sección están
   * inactivos. Con periodId: 404 si no existe, 422 si es de otro año, 409 si está cerrado.
   */
  async assertCourseSectionWritable(courseSectionId: string, periodId?: string): Promise<void> {
    const cs = await this.prisma.courseSection.findUnique({
      where: { id: courseSectionId },
      include: { section: { include: { academicYear: true } } },
    });
    if (!cs) throw new NotFoundException(MSG.courseSectionNotFound);
    const year = cs.section.academicYear;
    if (year.isActive !== true || year.closedAt !== null) {
      throw new ConflictException('El año académico no está activo');
    }
    if (!cs.section.isActive || !cs.isActive) {
      throw new ConflictException('La sección o el curso están inactivos');
    }
    if (periodId === undefined) return;

    const period = await this.prisma.academicPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException(MSG.periodNotFound);
    if (period.academicYearId !== year.id) {
      throw new UnprocessableEntityException('El período no pertenece al año del curso');
    }
    if (period.closedAt !== null) throw new ConflictException('El período está cerrado');
  }

  /**
   * Matrículas vigentes de una sección, por nombre (incluye estudiantes INACTIVE). 404 si no existe.
   *
   * ADVERTENCIA (seguridad): no comprueba permisos. El llamador debe validar antes que el actor
   * puede ver la sección (p. ej. assertCanAccessCourseSection / rol ADMIN o docente del curso) y
   * nunca debe devolver esta lista a STUDENT ni GUARDIAN (expone a otros estudiantes).
   */
  async listCurrentEnrollments(sectionId: string): Promise<CurrentEnrollment[]> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException(MSG.sectionNotFound);
    const rows = await this.prisma.enrollment.findMany({
      where: { sectionId, isCurrent: true },
      include: { student: { select: { fullName: true, status: true } } },
      orderBy: { student: { fullName: 'asc' } },
    });
    return rows.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      fullName: e.student.fullName,
      status: e.student.status,
      effectiveFrom: e.effectiveFrom.toISOString(),
    }));
  }

  /**
   * Historial de matrículas de un estudiante en un año (vigente y cerradas), por effectiveFrom.
   *
   * ADVERTENCIA (seguridad): no comprueba permisos. El llamador debe validar antes que el actor
   * puede ver a ese estudiante y nunca debe devolver esta lista a STUDENT ni GUARDIAN.
   */
  async listEnrollmentsOfStudent(
    studentId: string,
    academicYearId: string,
  ): Promise<StudentEnrollment[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, academicYearId },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map((e) => ({
      enrollmentId: e.id,
      sectionId: e.sectionId,
      academicYearId: e.academicYearId,
      isCurrent: marker(e.isCurrent),
      effectiveFrom: e.effectiveFrom.toISOString(),
      effectiveTo: toIso(e.effectiveTo),
      endReason: e.endReason,
    }));
  }

  /** Ids de los estudiantes vinculados a un apoderado. */
  async getLinkedStudentIds(guardianId: string): Promise<string[]> {
    const links = await this.prisma.guardianStudent.findMany({
      where: { guardianId },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  private async findCourseSectionOrFail(id: string) {
    const cs = await this.prisma.courseSection.findUnique({
      where: { id },
      select: { id: true, sectionId: true, teacherId: true },
    });
    if (!cs) throw new NotFoundException(MSG.courseSectionNotFound);
    return cs;
  }

  // La sesión solo trae { id, role }: el estado se consulta en la BD.
  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status !== 'ACTIVE') throw new ForbiddenException(MSG.forbidden);
  }

  private async hasCurrentEnrollment(studentIds: string[], sectionId: string): Promise<boolean> {
    if (studentIds.length === 0) return false;
    const found = await this.prisma.enrollment.findFirst({
      where: { studentId: { in: studentIds }, sectionId, isCurrent: true },
      select: { id: true },
    });
    return found !== null;
  }
}
