import type { EducationLevel } from '@aula/shared';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { recordAcademic } from './academic-audit.js';
import { AcademicAccessService } from './academic-access.service.js';
import type {
  AssignTeacherDto,
  CreateCourseSectionDto,
  UpdateCourseSectionDto,
} from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import type { Actor } from './request-user.js';

type Person = { id: string; fullName: string };

export type CourseSectionView = {
  id: string;
  sectionId: string;
  course: { id: string; name: string };
  teacher: Person | null;
  isActive: boolean;
};

export type MyCourseSection = {
  id: string;
  course: { id: string; name: string };
  section: { id: string; level: EducationLevel; gradeLevel: number; code: string };
  academicYear: { id: string; year: number };
  teacher: Person | null;
  enrollmentId?: string;
};

const viewInclude = {
  course: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
} as const;

const toView = (cs: CourseSectionView): CourseSectionView => ({
  id: cs.id,
  sectionId: cs.sectionId,
  course: cs.course,
  teacher: cs.teacher,
  isActive: cs.isActive,
});

const DUPLICATE = 'El curso ya está asignado a la sección';

@Injectable()
export class CourseSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
  ) {}

  async listBySection(sectionId: string): Promise<{ items: CourseSectionView[]; total: number }> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true },
    });
    if (!section) throw new NotFoundException(MSG.sectionNotFound);
    const rows = await this.prisma.courseSection.findMany({
      where: { sectionId },
      include: viewInclude,
      orderBy: { course: { name: 'asc' } },
    });
    const items = rows.map(toView);
    return { items, total: items.length };
  }

  // RF-13/14: curso en una sección, con o sin docente.
  async create(
    sectionId: string,
    dto: CreateCourseSectionDto,
    actor: Actor,
  ): Promise<CourseSectionView> {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { academicYear: true },
    });
    if (!section) throw new NotFoundException(MSG.sectionNotFound);
    const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException(MSG.courseNotFound);
    if (await this.access.isYearReadOnly(section.academicYear)) {
      throw new ConflictException(MSG.readOnlyYear);
    }
    if (!section.isActive) throw new ConflictException('La sección está inactiva');
    const duplicate = await this.prisma.courseSection.findUnique({
      where: { sectionId_courseId: { sectionId, courseId: dto.courseId } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(DUPLICATE);
    if (!course.isActive) throw new UnprocessableEntityException('El curso está inactivo');
    const teacherId = dto.teacherId ?? null;
    if (teacherId !== null) await this.assertValidTeacher(teacherId);

    const created = await this.prisma.courseSection
      .create({ data: { sectionId, courseId: dto.courseId, teacherId }, include: viewInclude })
      .catch((e: unknown) => mapPrismaError(e, DUPLICATE));

    await recordAcademic(this.audit, actor, 'course_section.create', 'CourseSection', created.id, {
      after: { sectionId, courseId: dto.courseId, teacherId },
    });
    return toView(created);
  }

  async update(id: string, dto: UpdateCourseSectionDto, actor: Actor): Promise<CourseSectionView> {
    const cs = await this.findWithYear(id);
    if (cs.isActive === dto.isActive) return toView(cs);
    if (await this.access.isYearReadOnly(cs.section.academicYear)) {
      throw new ConflictException(MSG.readOnlyYear);
    }

    const updated = await this.prisma.courseSection
      .update({ where: { id }, data: { isActive: dto.isActive }, include: viewInclude })
      .catch((e: unknown) => mapPrismaError(e));

    await recordAcademic(this.audit, actor, 'course_section.update', 'CourseSection', id, {
      before: { isActive: cs.isActive },
      after: { isActive: dto.isActive },
    });
    return toView(updated);
  }

  // RF-14 / D-029: asignar, reasignar o quitar al docente; cada cambio va a la bitácora.
  async assignTeacher(id: string, dto: AssignTeacherDto, actor: Actor): Promise<CourseSectionView> {
    const cs = await this.findWithYear(id);
    if (await this.access.isYearReadOnly(cs.section.academicYear)) {
      throw new ConflictException(MSG.readOnlyYear);
    }
    if (dto.teacherId !== null) await this.assertValidTeacher(dto.teacherId);
    if (cs.teacherId === dto.teacherId) return toView(cs);

    const updated = await this.prisma.courseSection
      .update({ where: { id }, data: { teacherId: dto.teacherId }, include: viewInclude })
      .catch((e: unknown) => mapPrismaError(e));

    await recordAcademic(this.audit, actor, 'course_section.assign_teacher', 'CourseSection', id, {
      before: { teacherId: cs.teacherId },
      after: { teacherId: dto.teacherId },
    });
    return toView(updated);
  }

  /**
   * Cursos accesibles del año activo (curso-sección y sección activos). TEACHER: los que dicta.
   * STUDENT: los de la sección de su matrícula vigente, con enrollmentId. Sin año activo o con
   * usuario no ACTIVE → lista vacía.
   */
  async listMine(user: AuthenticatedUser): Promise<{ items: MyCourseSection[]; total: number }> {
    const empty = { items: [], total: 0 };
    const active = await this.access.getActiveYear();
    if (!active) return empty;
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { status: true },
    });
    if (me?.status !== 'ACTIVE') return empty;

    let sectionFilter: { sectionId?: string; teacherId?: string };
    let enrollmentId: string | undefined;
    if (user.role === 'TEACHER') {
      sectionFilter = { teacherId: user.id };
    } else {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { studentId: user.id, academicYearId: active.id, isCurrent: true },
        select: { id: true, sectionId: true },
      });
      if (!enrollment) return empty;
      sectionFilter = { sectionId: enrollment.sectionId };
      enrollmentId = enrollment.id;
    }

    const rows = await this.prisma.courseSection.findMany({
      where: {
        ...sectionFilter,
        isActive: true,
        section: { isActive: true, academicYearId: active.id },
      },
      include: { ...viewInclude, section: true },
      orderBy: [
        { section: { level: 'asc' } },
        { section: { gradeLevel: 'asc' } },
        { section: { code: 'asc' } },
        { course: { name: 'asc' } },
      ],
    });
    const items = rows.map((cs): MyCourseSection => ({
      id: cs.id,
      course: cs.course,
      section: {
        id: cs.section.id,
        level: cs.section.level,
        gradeLevel: cs.section.gradeLevel,
        code: cs.section.code,
      },
      academicYear: { id: active.id, year: active.year },
      teacher: cs.teacher,
      ...(enrollmentId ? { enrollmentId } : {}),
    }));
    return { items, total: items.length };
  }

  private async findWithYear(id: string) {
    const cs = await this.prisma.courseSection.findUnique({
      where: { id },
      include: { ...viewInclude, section: { include: { academicYear: true } } },
    });
    if (!cs) throw new NotFoundException(MSG.courseSectionNotFound);
    return cs;
  }

  // Decisión 4: existe, rol TEACHER y estado ACTIVE.
  private async assertValidTeacher(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (user?.role !== 'TEACHER' || user.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(MSG.invalidTeacher);
    }
  }
}
