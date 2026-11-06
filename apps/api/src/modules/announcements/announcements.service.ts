import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AnnouncementScope } from '../../generated/prisma/enums.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { MSG as ACADEMIC_MSG } from '../academic/academic.errors.js';
import type { Actor } from '../academic/request-user.js';
import { recordAnnouncement } from './announcements-audit.js';
import { AnnouncementEventPublisher } from './announcements-events.js';
import {
  ANNOUNCEMENTS_PAGE_SIZE,
  type AdminAnnouncementDto,
  type CourseAnnouncementDto,
  type MeAnnouncementsQuery,
  type PageQuery,
  type UpdateAnnouncementDto,
} from './announcements.dto.js';

// Anuncios (RF-32). Alcances: COURSE_SECTION (docente asignado o ADMIN), INSTITUTION y GRADE (solo
// ADMIN). Se publican al crearse (publishedAt) y se retiran con borrado lógico (RN-14). Solo se
// escribe en el año activo y sin cerrar. Quién ve qué (GET /me/announcements), en el año activo:
// - STUDENT: INSTITUTION, GRADE de su grado y COURSE_SECTION de su sección (matrícula vigente).
// - TEACHER: INSTITUTION, GRADE de los grados que enseña y COURSE_SECTION de sus cursos.
// - GUARDIAN: lo mismo que sus estudiantes con vínculo vigente (o solo `studentId`); sin
//   estudiantes vinculados no ve nada.

export const MSG = {
  notFound: 'El anuncio no existe',
  noActiveYear: 'No hay un año académico activo',
  readOnly: 'El año del anuncio es de solo lectura',
  studentIdOnlyGuardian: 'Solo el apoderado puede indicar un estudiante',
} as const;

export type AnnouncementView = {
  id: string;
  scope: AnnouncementScope;
  gradeLevel: number | null;
  courseSectionId: string | null;
  course: { id: string; name: string } | null;
  section: { gradeLevel: number; code: string } | null;
  title: string;
  /** Texto plano: mostrarlo como texto, nunca como HTML. */
  body: string;
  publishedAt: string;
  updatedAt: string;
  edited: boolean;
  /** El actor puede editarlo o retirarlo (autor o ADMIN). La API lo vuelve a validar. */
  canEdit: boolean;
  /** Solo GUARDIAN: a cuáles de sus estudiantes alcanza el anuncio. */
  students?: { id: string; fullName: string }[];
};

export type AnnouncementPage = {
  items: AnnouncementView[];
  page: number;
  pageSize: number;
  total: number;
};

const select = {
  id: true,
  academicYearId: true,
  scope: true,
  gradeLevel: true,
  courseSectionId: true,
  title: true,
  body: true,
  authorId: true,
  publishedAt: true,
  updatedAt: true,
  courseSection: {
    select: {
      course: { select: { id: true, name: true } },
      section: { select: { gradeLevel: true, code: true } },
    },
  },
} satisfies Prisma.AnnouncementSelect;

type Row = Prisma.AnnouncementGetPayload<{ select: typeof select }>;

type AudienceStudent = {
  id: string;
  fullName: string;
  gradeLevel: number;
  courseSectionIds: Set<string>;
};

/** A quién alcanza el listado de /me/announcements. */
type Audience = {
  gradeLevels: number[];
  courseSectionIds: string[];
  /** Solo GUARDIAN: sus estudiantes con matrícula vigente. */
  students?: AudienceStudent[];
};

/** updatedAt nace igual a publishedAt; más de 1 s de diferencia = editado. */
const EDIT_TOLERANCE_MS = 1000;

/** Tope de anuncios por autor en 24 h (INFORME 17): limita el volumen de avisos y correos. */
export const ANNOUNCEMENT_DAILY_LIMIT = { institutional: 20, course: 50 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const activeCourseSections = (academicYearId: string) => ({
  isActive: true,
  section: { isActive: true, academicYearId },
});

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademicAccessService,
    private readonly audit: AuditService,
    private readonly events: AnnouncementEventPublisher,
  ) {}

  // ------------------------------------------------------------------ escritura

  /** POST /course-sections/:id/announcements. TEACHER asignado o ADMIN. */
  async createForCourseSection(
    user: AuthenticatedUser,
    actor: Actor,
    courseSectionId: string,
    dto: CourseAnnouncementDto,
  ): Promise<AnnouncementView> {
    await this.assertCourseManager(user, courseSectionId);
    await this.access.assertCourseSectionWritable(courseSectionId);
    await this.assertDailyLimit(user.id, 'course');
    const cs = await this.prisma.courseSection.findUniqueOrThrow({
      where: { id: courseSectionId },
      select: { section: { select: { academicYearId: true } } },
    });
    const row = await this.prisma.announcement.create({
      data: {
        academicYearId: cs.section.academicYearId,
        scope: 'COURSE_SECTION',
        courseSectionId,
        title: dto.title,
        body: dto.body,
        authorId: user.id,
      },
      select,
    });
    await this.afterCreate(actor, row);
    return this.toView(row, user);
  }

  /** POST /announcements (ADMIN): INSTITUTION o GRADE del año activo y sin cerrar. */
  async createInstitutional(
    user: AuthenticatedUser,
    actor: Actor,
    dto: AdminAnnouncementDto,
  ): Promise<AnnouncementView> {
    const active = await this.access.getActiveYear();
    if (!active) throw new ConflictException(MSG.noActiveYear);
    const year = await this.prisma.academicYear.findUnique({
      where: { id: active.id },
      select: { closedAt: true },
    });
    if (year?.closedAt) throw new ConflictException(ACADEMIC_MSG.yearClosed);
    await this.assertDailyLimit(user.id, 'institutional');
    const row = await this.prisma.announcement.create({
      data: {
        academicYearId: active.id,
        scope: dto.scope,
        gradeLevel: dto.scope === 'GRADE' ? dto.gradeLevel : null,
        title: dto.title,
        body: dto.body,
        authorId: user.id,
      },
      select,
    });
    await this.afterCreate(actor, row);
    return this.toView(row, user);
  }

  /** PATCH /announcements/:id. Autor o ADMIN; no vuelve a notificar. */
  async update(
    user: AuthenticatedUser,
    actor: Actor,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementView> {
    const current = await this.findEditable(user, id);
    const data: { title?: string; body?: string } = {};
    if (dto.title !== undefined && dto.title !== current.title) data.title = dto.title;
    if (dto.body !== undefined && dto.body !== current.body) data.body = dto.body;
    const changedFields = Object.keys(data);
    if (changedFields.length > 0) {
      const res = await this.prisma.announcement.updateMany({
        where: { id, deletedAt: null },
        data,
      });
      if (res.count === 0) throw new NotFoundException(MSG.notFound);
      await recordAnnouncement(this.audit, actor, 'announcement.update', id, {
        scope: current.scope,
        changedFields,
      });
    }
    const row = await this.prisma.announcement.findUniqueOrThrow({ where: { id }, select });
    return this.toView(row, user);
  }

  /** DELETE /announcements/:id: borrado lógico (RN-14). Autor o ADMIN. */
  async remove(user: AuthenticatedUser, actor: Actor, id: string): Promise<void> {
    const current = await this.findEditable(user, id);
    const res = await this.prisma.announcement.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    if (res.count === 0) throw new NotFoundException(MSG.notFound);
    await recordAnnouncement(this.audit, actor, 'announcement.delete', id, {
      scope: current.scope,
    });
  }

  // ------------------------------------------------------------------ lectura

  /** GET /course-sections/:id/announcements. TEACHER asignado o ADMIN. */
  async listForCourseSection(
    user: AuthenticatedUser,
    courseSectionId: string,
    query: PageQuery,
  ): Promise<AnnouncementPage> {
    await this.assertCourseManager(user, courseSectionId);
    return this.page({ courseSectionId, scope: 'COURSE_SECTION', deletedAt: null }, query, user);
  }

  /** GET /announcements (ADMIN): anuncios INSTITUTION y GRADE del año activo. */
  async listInstitutional(user: AuthenticatedUser, query: PageQuery): Promise<AnnouncementPage> {
    const year = await this.access.getActiveYear();
    if (!year) return this.empty(query);
    return this.page(
      { academicYearId: year.id, scope: { in: ['INSTITUTION', 'GRADE'] }, deletedAt: null },
      query,
      user,
    );
  }

  /** GET /me/announcements. STUDENT, TEACHER y GUARDIAN. */
  async listMine(user: AuthenticatedUser, query: MeAnnouncementsQuery): Promise<AnnouncementPage> {
    if (query.studentId !== undefined && user.role !== 'GUARDIAN') {
      throw new BadRequestException({
        message: [{ path: 'studentId', message: MSG.studentIdOnlyGuardian }],
      });
    }
    await this.assertActive(user.id);
    const year = await this.access.getActiveYear();
    if (!year) return this.empty(query);
    const audience = await this.audienceOf(user, year.id, query.studentId);
    if (!audience) return this.empty(query);

    const or: Prisma.AnnouncementWhereInput[] = [{ scope: 'INSTITUTION' }];
    if (audience.gradeLevels.length > 0) {
      or.push({ scope: 'GRADE', gradeLevel: { in: audience.gradeLevels } });
    }
    if (audience.courseSectionIds.length > 0) {
      or.push({ scope: 'COURSE_SECTION', courseSectionId: { in: audience.courseSectionIds } });
    }
    const result = await this.page(
      { academicYearId: year.id, deletedAt: null, OR: or },
      query,
      user,
    );
    const students = audience.students;
    if (!students) return result;
    // GUARDIAN: a cuáles de sus estudiantes alcanza cada anuncio (solo los suyos).
    for (const item of result.items) {
      item.students = students
        .filter((s) => reaches(item, s))
        .map((s) => ({ id: s.id, fullName: s.fullName }));
    }
    return result;
  }

  // ------------------------------------------------------------------ apoyo

  /** 429 ANNOUNCEMENT_LIMIT si el autor ya publicó el tope de su tipo en las últimas 24 h. */
  private async assertDailyLimit(
    authorId: string,
    kind: keyof typeof ANNOUNCEMENT_DAILY_LIMIT,
  ): Promise<void> {
    const limit = ANNOUNCEMENT_DAILY_LIMIT[kind];
    const count = await this.prisma.announcement.count({
      where: {
        authorId,
        scope: kind === 'course' ? 'COURSE_SECTION' : { in: ['INSTITUTION', 'GRADE'] },
        publishedAt: { gte: new Date(Date.now() - DAY_MS) },
      },
    });
    if (count >= limit) {
      throw new HttpException(
        {
          code: 'ANNOUNCEMENT_LIMIT',
          message: `Llegaste al máximo de ${limit} anuncios en 24 horas. Inténtalo más tarde.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async afterCreate(actor: Actor, row: Row): Promise<void> {
    await recordAnnouncement(this.audit, actor, 'announcement.create', row.id, {
      scope: row.scope,
      gradeLevel: row.gradeLevel,
      courseSectionId: row.courseSectionId,
    });
    this.events.publish({
      type: 'announcement.published.v1',
      payload: {
        announcementId: row.id,
        academicYearId: row.academicYearId,
        scope: row.scope,
        gradeLevel: row.gradeLevel,
        courseSectionId: row.courseSectionId,
        publishedAt: row.publishedAt.toISOString(),
      },
    });
  }

  /** TEACHER asignado (404/403 de Dev 2) o ADMIN (404 si no existe). */
  private async assertCourseManager(
    user: AuthenticatedUser,
    courseSectionId: string,
  ): Promise<void> {
    if (user.role === 'TEACHER') {
      await this.access.assertTeacherOf(user.id, courseSectionId);
      return;
    }
    if (user.role !== 'ADMIN') throw new ForbiddenException(ACADEMIC_MSG.forbidden);
    const cs = await this.prisma.courseSection.findUnique({
      where: { id: courseSectionId },
      select: { id: true },
    });
    if (!cs) throw new NotFoundException(ACADEMIC_MSG.courseSectionNotFound);
  }

  /**
   * Anuncio vigente que el actor puede editar: 404 si no existe o está retirado; 403 si no es el
   * autor ni ADMIN, o si el autor docente ya no tiene el curso; 409 si el año no es escribible.
   */
  private async findEditable(user: AuthenticatedUser, id: string) {
    const current = await this.prisma.announcement.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        scope: true,
        title: true,
        body: true,
        authorId: true,
        courseSectionId: true,
        academicYear: { select: { isActive: true, closedAt: true } },
      },
    });
    if (!current) throw new NotFoundException(MSG.notFound);
    if (user.role !== 'ADMIN') {
      if (current.authorId !== user.id || current.courseSectionId === null) {
        throw new ForbiddenException(ACADEMIC_MSG.forbidden);
      }
      await this.access.assertTeacherOf(user.id, current.courseSectionId);
    }
    if (current.academicYear.isActive !== true || current.academicYear.closedAt !== null) {
      throw new ConflictException(MSG.readOnly);
    }
    if (current.courseSectionId !== null) {
      await this.access.assertCourseSectionWritable(current.courseSectionId);
    }
    return current;
  }

  private async page(
    where: Prisma.AnnouncementWhereInput,
    query: PageQuery,
    user: AuthenticatedUser,
  ): Promise<AnnouncementPage> {
    const [total, rows] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        select,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * ANNOUNCEMENTS_PAGE_SIZE,
        take: ANNOUNCEMENTS_PAGE_SIZE,
      }),
    ]);
    return {
      items: rows.map((r) => this.toView(r, user)),
      page: query.page,
      pageSize: ANNOUNCEMENTS_PAGE_SIZE,
      total,
    };
  }

  private empty(query: PageQuery): AnnouncementPage {
    return { items: [], page: query.page, pageSize: ANNOUNCEMENTS_PAGE_SIZE, total: 0 };
  }

  private toView(r: Row, user: AuthenticatedUser): AnnouncementView {
    return {
      id: r.id,
      scope: r.scope,
      gradeLevel: r.gradeLevel,
      courseSectionId: r.courseSectionId,
      course: r.courseSection?.course ?? null,
      section: r.courseSection?.section ?? null,
      title: r.title,
      body: r.body,
      publishedAt: r.publishedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      edited: r.updatedAt.getTime() - r.publishedAt.getTime() > EDIT_TOLERANCE_MS,
      canEdit: user.role === 'ADMIN' || r.authorId === user.id,
    };
  }

  private async audienceOf(
    user: AuthenticatedUser,
    academicYearId: string,
    studentId: string | undefined,
  ): Promise<Audience | null> {
    switch (user.role) {
      case 'TEACHER': {
        const rows = await this.prisma.courseSection.findMany({
          where: { ...activeCourseSections(academicYearId), teacherId: user.id },
          select: { id: true, section: { select: { gradeLevel: true } } },
        });
        return {
          courseSectionIds: rows.map((r) => r.id),
          gradeLevels: [...new Set(rows.map((r) => r.section.gradeLevel))],
        };
      }
      case 'STUDENT': {
        const [me] = await this.studentsAudience([user.id], academicYearId);
        if (!me) return { gradeLevels: [], courseSectionIds: [] };
        return { gradeLevels: [me.gradeLevel], courseSectionIds: [...me.courseSectionIds] };
      }
      case 'GUARDIAN': {
        const linked = await this.access.getLinkedStudentIds(user.id);
        if (studentId !== undefined && !linked.includes(studentId)) {
          throw new ForbiddenException(ACADEMIC_MSG.forbidden);
        }
        const ids = studentId !== undefined ? [studentId] : linked;
        if (ids.length === 0) return null;
        const students = await this.studentsAudience(ids, academicYearId);
        return {
          gradeLevels: [...new Set(students.map((s) => s.gradeLevel))],
          courseSectionIds: [...new Set(students.flatMap((s) => [...s.courseSectionIds]))],
          students,
        };
      }
      default:
        // ADMIN no tiene bandeja propia (el controlador ya responde 403 por rol).
        throw new ForbiddenException(ACADEMIC_MSG.forbidden);
    }
  }

  /** Estudiantes con matrícula vigente en el año: grado y cursos-sección activos de su sección. */
  private async studentsAudience(
    studentIds: string[],
    academicYearId: string,
  ): Promise<AudienceStudent[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        academicYearId,
        isCurrent: true,
        section: { isActive: true },
      },
      select: {
        sectionId: true,
        section: { select: { gradeLevel: true } },
        student: { select: { id: true, fullName: true } },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    const sectionIds = [...new Set(enrollments.map((e) => e.sectionId))];
    const cs =
      sectionIds.length === 0
        ? []
        : await this.prisma.courseSection.findMany({
            where: { ...activeCourseSections(academicYearId), sectionId: { in: sectionIds } },
            select: { id: true, sectionId: true },
          });
    return enrollments.map((e) => ({
      id: e.student.id,
      fullName: e.student.fullName,
      gradeLevel: e.section.gradeLevel,
      courseSectionIds: new Set(cs.filter((c) => c.sectionId === e.sectionId).map((c) => c.id)),
    }));
  }

  private async assertActive(userId: string): Promise<void> {
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (me?.status !== 'ACTIVE') throw new ForbiddenException(ACADEMIC_MSG.forbidden);
  }
}

/** El anuncio alcanza al estudiante (para la lista del apoderado). */
export function reaches(
  item: Pick<AnnouncementView, 'scope' | 'gradeLevel' | 'courseSectionId'>,
  s: Pick<AudienceStudent, 'gradeLevel' | 'courseSectionIds'>,
): boolean {
  if (item.scope === 'INSTITUTION') return true;
  if (item.scope === 'GRADE') return s.gradeLevel === item.gradeLevel;
  return item.courseSectionId !== null && s.courseSectionIds.has(item.courseSectionId);
}
