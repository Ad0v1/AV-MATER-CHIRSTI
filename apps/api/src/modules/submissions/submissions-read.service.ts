import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { LatestVersionSummary } from './submissions.types.js';

// Contrato de lectura para Dev 4 (INFORME 1, sección 5). Dev 3 nunca escribe en Grade.
//
// ADVERTENCIA (seguridad): no comprueba permisos. El llamador (API de calificaciones) debe validar
// antes que el actor es el docente asignado o ADMIN (assertCanWriteCourseSection o equivalente).

export type AssignmentForGrading = {
  id: string;
  courseSectionId: string;
  periodId: string;
  dueAt: string;
  allowLate: boolean;
  /** RN-05: nota NE de la tarea, texto con 2 decimales ("0.00"). */
  noSubmissionGrade: string;
};

export type SubmissionSummary = {
  enrollmentId: string;
  submissionId: string;
  versionCount: number;
  /** RN-09: versión oficial (mayor versionNumber). */
  latestVersion: LatestVersionSummary;
};

@Injectable()
export class SubmissionsReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Configuración de la tarea para calificar. 404 si no existe o está borrada. */
  async getAssignmentForGrading(assignmentId: string): Promise<AssignmentForGrading> {
    const a = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: {
        id: true,
        courseSectionId: true,
        periodId: true,
        dueAt: true,
        allowLate: true,
        noSubmissionGrade: true,
      },
    });
    if (!a) throw new NotFoundException('La tarea no existe');
    return {
      id: a.id,
      courseSectionId: a.courseSectionId,
      periodId: a.periodId,
      dueAt: a.dueAt.toISOString(),
      allowLate: a.allowLate,
      noSubmissionGrade: a.noSubmissionGrade.toFixed(2),
    };
  }

  /**
   * Entregas con al menos una versión, una por matrícula (incluye matrículas ya cerradas, p. ej.
   * trasladados: RN-14). Las matrículas sin entrega no aparecen: Dev 4 las cruza con
   * AcademicAccessService.listCurrentEnrollments.
   */
  async listSubmissionSummaries(assignmentId: string): Promise<SubmissionSummary[]> {
    const rows = await this.prisma.submission.findMany({
      where: { assignmentId, versions: { some: {} } },
      include: {
        versions: {
          select: { id: true, versionNumber: true, receivedAt: true, isLate: true, fileId: true },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((s) => {
      const v = s.versions[0];
      return {
        enrollmentId: s.enrollmentId,
        submissionId: s.id,
        versionCount: s.versions.length,
        latestVersion: {
          versionId: v.id,
          versionNumber: v.versionNumber,
          receivedAt: v.receivedAt.toISOString(),
          isLate: v.isLate,
          fileId: v.fileId,
        },
      };
    });
  }
}
