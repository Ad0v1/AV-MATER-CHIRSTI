import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { NOTIFICATIONS_PAGE_SIZE, type NotificationsQuery } from './notifications.dto.js';

// Bandeja de avisos (RF-53). Cada persona solo ve y marca las suyas (recipientId = sesión): una
// notificación ajena responde 404, igual que una inexistente. La fila no guarda textos: el mensaje
// se arma al leer con `type` y `entityId`, con datos vigentes y sin datos de otros estudiantes
// (nunca la nota; el apoderado solo ve el nombre de su estudiante si el vínculo sigue vigente).

export const MSG = { notFound: 'La notificación no existe' } as const;

export type NotificationTarget = 'ASSIGNMENT' | 'GRADE' | 'ANNOUNCEMENT';

export type NotificationView = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** Mensaje en español, texto plano. */
  message: string;
  /** Para armar el enlace en la web; null si el recurso ya no está disponible. */
  target: NotificationTarget | null;
  courseSectionId: string | null;
  /** Solo para el apoderado: su estudiante (vínculo vigente). */
  studentId: string | null;
};

export type NotificationPage = {
  items: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

type Row = {
  id: string;
  type: NotificationType;
  entityId: string;
  createdAt: Date;
  readAt: Date | null;
};

type AssignmentInfo = {
  title: string;
  dueAt: Date;
  deletedAt: Date | null;
  courseSectionId: string;
  sectionId: string;
  course: string;
};
type GradeInfo = {
  studentId: string;
  studentName: string;
  assignment: AssignmentInfo;
};
type AnnouncementInfo = {
  title: string;
  deletedAt: Date | null;
  scope: 'INSTITUTION' | 'GRADE' | 'COURSE_SECTION';
  level: string | null;
  gradeLevel: number | null;
  sectionId: string | null;
  courseSectionId: string | null;
  course: string | null;
};

const limaDateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Hora de Lima, para el mensaje de plazos. */
export function formatLima(date: Date): string {
  return `${limaDateTime.format(date)} (hora de Lima)`;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademicAccessService,
  ) {}

  async list(user: AuthenticatedUser, query: NotificationsQuery): Promise<NotificationPage> {
    const where = { recipientId: user.id, ...(query.unread ? { readAt: null } : {}) };
    const [total, unreadCount, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        select: { id: true, type: true, entityId: true, createdAt: true, readAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * NOTIFICATIONS_PAGE_SIZE,
        take: NOTIFICATIONS_PAGE_SIZE,
      }),
    ]);
    return {
      items: await this.compose(user, rows),
      page: query.page,
      pageSize: NOTIFICATIONS_PAGE_SIZE,
      total,
      unreadCount,
    };
  }

  /** Marca como leída una notificación propia. Idempotente; 404 si no es suya o no existe. */
  async markRead(user: AuthenticatedUser, id: string): Promise<void> {
    const res = await this.prisma.notification.updateMany({
      where: { id, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count > 0) return;
    const mine = await this.prisma.notification.findFirst({
      where: { id, recipientId: user.id },
      select: { id: true },
    });
    if (!mine) throw new NotFoundException(MSG.notFound);
  }

  /** Marca como leídas todas las propias. */
  async markAllRead(user: AuthenticatedUser): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  // ------------------------------------------------------------------ mensajes

  private async compose(user: AuthenticatedUser, rows: Row[]): Promise<NotificationView[]> {
    const ids = (types: NotificationType[]) => [
      ...new Set(rows.filter((r) => types.includes(r.type)).map((r) => r.entityId)),
    ];
    const [assignments, grades, announcements] = await Promise.all([
      this.assignments(ids(['ASSIGNMENT_CREATED', 'ASSIGNMENT_DUE_SOON'])),
      this.grades(ids(['GRADE_PUBLISHED'])),
      this.announcements(ids(['ANNOUNCEMENT_PUBLISHED'])),
    ]);
    const needsLinks = user.role === 'GUARDIAN' && rows.length > 0;
    const linkedIds = needsLinks ? await this.access.getLinkedStudentIds(user.id) : [];
    const linked = new Set(linkedIds);
    // Pertenencia vigente (INFORME 17): secciones y grados actuales del estudiante o de los
    // estudiantes vinculados. Si ya no corresponde, el aviso queda con un mensaje genérico.
    const reach = await this.reachOf(user, linkedIds);

    return rows.map((r) => {
      const base = {
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
      };
      const gone = (message: string): NotificationView => ({
        ...base,
        message,
        target: null,
        courseSectionId: null,
        studentId: null,
      });
      switch (r.type) {
        case 'ASSIGNMENT_CREATED':
        case 'ASSIGNMENT_DUE_SOON': {
          const a = assignments.get(r.entityId);
          if (!a || a.deletedAt || !reach.sections.has(a.sectionId)) {
            return gone('Una tarea ya no está disponible.');
          }
          const message =
            r.type === 'ASSIGNMENT_CREATED'
              ? `Nueva tarea en ${a.course}: «${a.title}». Vence el ${formatLima(a.dueAt)}.`
              : `La tarea «${a.title}» de ${a.course} vence el ${formatLima(a.dueAt)}.`;
          return {
            ...base,
            message,
            target: 'ASSIGNMENT',
            courseSectionId: a.courseSectionId,
            studentId: null,
          };
        }
        case 'GRADE_PUBLISHED': {
          const g = grades.get(r.entityId);
          const own = g && user.role === 'STUDENT' && g.studentId === user.id;
          const ward = g && user.role === 'GUARDIAN' && linked.has(g.studentId);
          if (!g || g.assignment.deletedAt || (!own && !ward)) {
            return gone('Hay una calificación nueva.');
          }
          const who = ward ? ` de ${g.studentName}` : '';
          return {
            ...base,
            message: `Nueva calificación${who} en «${g.assignment.title}» (${g.assignment.course}).`,
            target: 'GRADE',
            courseSectionId: g.assignment.courseSectionId,
            studentId: ward ? g.studentId : null,
          };
        }
        case 'ANNOUNCEMENT_PUBLISHED': {
          const a = announcements.get(r.entityId);
          if (!a || a.deletedAt) return gone('Un anuncio fue retirado.');
          const allowed =
            a.scope === 'INSTITUTION' ||
            (a.scope === 'GRADE' &&
              a.gradeLevel !== null &&
              reach.grades.has(`${a.level}:${a.gradeLevel}`)) ||
            (a.scope === 'COURSE_SECTION' &&
              a.sectionId !== null &&
              reach.sections.has(a.sectionId));
          if (!allowed) return gone('Hay un anuncio que ya no está disponible.');
          const where = a.course ? ` en ${a.course}` : '';
          return {
            ...base,
            message: `Nuevo anuncio${where}: «${a.title}».`,
            target: 'ANNOUNCEMENT',
            courseSectionId: a.courseSectionId,
            studentId: null,
          };
        }
        default:
          return gone('Tienes un aviso nuevo.');
      }
    });
  }

  /** Secciones (matrícula vigente) y grados del estudiante o de sus estudiantes vinculados. */
  private async reachOf(
    user: AuthenticatedUser,
    linkedIds: string[],
  ): Promise<{ sections: Set<string>; grades: Set<string> }> {
    const studentIds =
      user.role === 'STUDENT' ? [user.id] : user.role === 'GUARDIAN' ? linkedIds : [];
    if (studentIds.length === 0) return { sections: new Set(), grades: new Set() };
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds }, isCurrent: true },
      select: { sectionId: true, section: { select: { level: true, gradeLevel: true } } },
    });
    return {
      sections: new Set(rows.map((r) => r.sectionId)),
      // Clave nivel:grado (3.° primaria no es 3.° secundaria).
      grades: new Set(rows.map((r) => `${r.section.level}:${r.section.gradeLevel}`)),
    };
  }

  private async assignments(ids: string[]): Promise<Map<string, AssignmentInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.assignment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        dueAt: true,
        deletedAt: true,
        courseSectionId: true,
        courseSection: { select: { sectionId: true, course: { select: { name: true } } } },
      },
    });
    return new Map(
      rows.map((a) => [
        a.id,
        {
          title: a.title,
          dueAt: a.dueAt,
          deletedAt: a.deletedAt,
          courseSectionId: a.courseSectionId,
          sectionId: a.courseSection.sectionId,
          course: a.courseSection.course.name,
        },
      ]),
    );
  }

  private async grades(ids: string[]): Promise<Map<string, GradeInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.grade.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        enrollment: { select: { student: { select: { id: true, fullName: true } } } },
        assignment: {
          select: {
            title: true,
            dueAt: true,
            deletedAt: true,
            courseSectionId: true,
            courseSection: { select: { sectionId: true, course: { select: { name: true } } } },
          },
        },
      },
    });
    return new Map(
      rows.map((g) => [
        g.id,
        {
          studentId: g.enrollment.student.id,
          studentName: g.enrollment.student.fullName,
          assignment: {
            title: g.assignment.title,
            dueAt: g.assignment.dueAt,
            deletedAt: g.assignment.deletedAt,
            courseSectionId: g.assignment.courseSectionId,
            sectionId: g.assignment.courseSection.sectionId,
            course: g.assignment.courseSection.course.name,
          },
        },
      ]),
    );
  }

  private async announcements(ids: string[]): Promise<Map<string, AnnouncementInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.announcement.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        scope: true,
        level: true,
        gradeLevel: true,
        courseSectionId: true,
        courseSection: { select: { sectionId: true, course: { select: { name: true } } } },
      },
    });
    return new Map(
      rows.map((a) => [
        a.id,
        {
          title: a.title,
          deletedAt: a.deletedAt,
          scope: a.scope,
          level: a.level,
          gradeLevel: a.gradeLevel,
          sectionId: a.courseSection?.sectionId ?? null,
          courseSectionId: a.courseSectionId,
          course: a.courseSection?.course.name ?? null,
        },
      ]),
    );
  }
}
