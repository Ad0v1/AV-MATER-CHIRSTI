import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';

// Destinatarios de los avisos (RF-53, U3): estudiantes con matrícula vigente y sus apoderados con
// vínculo vigente, todos ACTIVE. Solo en el año activo y sin cerrar, y en secciones y
// cursos-sección activos. Los docentes y ADMIN no reciben avisos en v1. Devuelve solo ids.

/** Año, sección y curso-sección donde se puede avisar. */
const openYear = { isActive: true, closedAt: null } as const;

@Injectable()
export class NotificationRecipients {
  constructor(private readonly prisma: PrismaService) {}

  /** Tarea vigente de un curso-sección activo del año activo; null si no corresponde avisar. */
  async assignment(assignmentId: string) {
    return this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        deletedAt: null,
        courseSection: { isActive: true, section: { isActive: true, academicYear: openYear } },
      },
      select: { id: true, dueAt: true, courseSection: { select: { sectionId: true } } },
    });
  }

  /** Estudiantes de la tarea (opcional: solo los que aún no entregan) y sus apoderados. */
  async forAssignment(
    assignment: { id: string; courseSection: { sectionId: string } },
    onlyPending = false,
  ): Promise<string[]> {
    const students = await this.studentsOfSections(
      [assignment.courseSection.sectionId],
      onlyPending ? assignment.id : undefined,
    );
    return this.withGuardians(students);
  }

  /** Nota MANUAL de una matrícula vigente: su estudiante y sus apoderados. */
  async forGrade(gradeId: string): Promise<{ entityId: string; recipients: string[] } | null> {
    const grade = await this.prisma.grade.findFirst({
      where: {
        id: gradeId,
        source: 'MANUAL',
        assignment: { deletedAt: null },
        enrollment: {
          isCurrent: true,
          student: { status: 'ACTIVE' },
          section: { isActive: true, academicYear: openYear },
        },
      },
      select: { id: true, enrollment: { select: { studentId: true } } },
    });
    if (!grade) return null;
    return {
      entityId: grade.id,
      recipients: await this.withGuardians([grade.enrollment.studentId]),
    };
  }

  /** Anuncio vigente del año activo: estudiantes de su alcance y sus apoderados. */
  async forAnnouncement(announcementId: string): Promise<string[] | null> {
    const a = await this.prisma.announcement.findFirst({
      where: { id: announcementId, deletedAt: null, academicYear: openYear },
      select: {
        academicYearId: true,
        scope: true,
        gradeLevel: true,
        courseSection: { select: { sectionId: true, isActive: true } },
      },
    });
    if (!a) return null;
    let sectionIds: string[];
    if (a.scope === 'COURSE_SECTION') {
      if (!a.courseSection?.isActive) return [];
      sectionIds = [a.courseSection.sectionId];
    } else {
      const sections = await this.prisma.section.findMany({
        where: {
          academicYearId: a.academicYearId,
          isActive: true,
          ...(a.scope === 'GRADE' ? { gradeLevel: a.gradeLevel ?? -1 } : {}),
        },
        select: { id: true },
      });
      sectionIds = sections.map((s) => s.id);
    }
    return this.withGuardians(await this.studentsOfSections(sectionIds));
  }

  /** Estudiantes ACTIVE con matrícula vigente en las secciones activas (sin entrega, si se pide). */
  async studentsOfSections(sectionIds: string[], pendingAssignmentId?: string): Promise<string[]> {
    if (sectionIds.length === 0) return [];
    const rows = await this.prisma.enrollment.findMany({
      where: {
        sectionId: { in: sectionIds },
        isCurrent: true,
        student: { status: 'ACTIVE' },
        section: { isActive: true },
        ...(pendingAssignmentId
          ? { submissions: { none: { assignmentId: pendingAssignmentId } } }
          : {}),
      },
      select: { studentId: true },
    });
    return [...new Set(rows.map((r) => r.studentId))];
  }

  /** Los estudiantes más sus apoderados ACTIVE con vínculo vigente, sin repetir. */
  async withGuardians(studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const links = await this.prisma.guardianStudent.findMany({
      where: {
        studentId: { in: studentIds },
        isActive: true,
        guardian: { status: 'ACTIVE' },
      },
      select: { guardianId: true },
    });
    return [...new Set([...studentIds, ...links.map((l) => l.guardianId)])];
  }
}
