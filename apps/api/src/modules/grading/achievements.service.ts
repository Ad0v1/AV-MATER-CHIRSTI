import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { scaleForLevel, type GradeLiteralCode } from '@aula/shared';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { isDeadlock, mapPrismaError } from '../academic/academic.errors.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import type { Actor } from '../academic/request-user.js';
import { assertCanWriteCourseSection, lockOpenPeriod } from '../contents/contents-guards.js';
import type { AchievementInputDto } from './grading.dto.js';
import { GRADE_ERRORS } from './grading.policy.js';
import type { AchievementView } from './grading.types.js';

// Logro del período en escala literal (INICIAL y PRIMARIA), elegido por el docente (decisión 2
// del usuario, 09/11/2026). En SECUNDARIA el promedio se calcula al leer (RN-02/03) y no hay logro.
// Bitácora: solo el literal antes/después y los campos cambiados; nunca el comentario (dato de
// un menor, U2/U3).

export const ACHIEVEMENT_MSG = {
  enrollmentNotFound: 'La matrícula no existe',
  numericScale: 'Este nivel califica con promedio de 0 a 20: no tiene logro del período',
  busy: 'Otro logro se está registrando a la vez; vuelve a intentarlo',
} as const;

const MAX_ATTEMPTS = 3;

const select = {
  id: true,
  enrollmentId: true,
  courseSectionId: true,
  periodId: true,
  literal: true,
  comment: true,
  gradedAt: true,
  updatedAt: true,
} as const;

type Row = {
  id: string;
  enrollmentId: string;
  courseSectionId: string;
  periodId: string;
  literal: GradeLiteralCode;
  comment: string | null;
  gradedAt: Date;
  updatedAt: Date;
};

const toView = (r: Row): AchievementView => ({
  id: r.id,
  enrollmentId: r.enrollmentId,
  courseSectionId: r.courseSectionId,
  periodId: r.periodId,
  literal: r.literal,
  comment: r.comment,
  gradedAt: r.gradedAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const retriable = (error: unknown): boolean => {
  if (isDeadlock(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
};

@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
  ) {}

  /**
   * PUT /course-sections/:id/periods/:periodId/achievements/:enrollmentId.
   * Docente asignado o ADMIN. 404 curso-sección, período o matrícula; 403 sin permiso;
   * 409 período o año cerrado (RN-10); 422 período de otro año o matrícula de otra sección;
   * 400 si la sección es de SECUNDARIA (escala numérica).
   */
  async put(
    courseSectionId: string,
    periodId: string,
    enrollmentId: string,
    input: AchievementInputDto,
    user: AuthenticatedUser,
    actor: Actor,
  ): Promise<AchievementView> {
    await assertCanWriteCourseSection(this.access, user, courseSectionId);
    const cs = await this.prisma.courseSection.findUnique({
      where: { id: courseSectionId },
      select: { sectionId: true, section: { select: { level: true } } },
    });
    if (!cs) throw new NotFoundException('El curso no existe');
    if (scaleForLevel(cs.section.level) !== 'LITERAL_ADABC') {
      throw new BadRequestException({
        message: [{ path: 'literal', message: ACHIEVEMENT_MSG.numericScale }],
      });
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { sectionId: true },
    });
    if (!enrollment) throw new NotFoundException(ACHIEVEMENT_MSG.enrollmentNotFound);
    if (enrollment.sectionId !== cs.sectionId) {
      throw new UnprocessableEntityException({
        code: 'ENROLLMENT_OUT_OF_SECTION',
        message: GRADE_ERRORS.ENROLLMENT_OUT_OF_SECTION,
      });
    }
    await this.access.assertCourseSectionWritable(courseSectionId, periodId);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // RN-10: el cierre del período espera a esta transacción (FOR SHARE).
          await lockOpenPeriod(tx, periodId);
          const where = {
            enrollmentId_courseSectionId_periodId: { enrollmentId, courseSectionId, periodId },
          };
          const before = await tx.periodAchievement.findUnique({ where, select });
          const changed: string[] = [];
          if (!before || before.literal !== input.literal) changed.push('literal');
          if ((before?.comment ?? null) !== input.comment) changed.push('comment');
          if (before && changed.length === 0) return toView(before);

          const now = new Date();
          const after = before
            ? await tx.periodAchievement.update({
                where: { id: before.id },
                data: { literal: input.literal, comment: input.comment, gradedAt: now },
                select,
              })
            : await tx.periodAchievement.create({
                data: {
                  enrollmentId,
                  courseSectionId,
                  periodId,
                  literal: input.literal,
                  comment: input.comment,
                  gradedAt: now,
                },
                select,
              });
          // D-047: bitácora en la misma transacción. Sin el comentario (dato de un menor).
          await this.audit.record(
            {
              actorId: actor.id,
              ip: actor.ip,
              module: 'grading',
              action: before ? 'grading.achievement.update' : 'grading.achievement.create',
              entityType: 'PeriodAchievement',
              entityId: after.id,
              beforeState: before ? { literal: before.literal } : undefined,
              afterState: {
                literal: after.literal,
                enrollmentId,
                courseSectionId,
                periodId,
                changedFields: changed,
              },
            },
            tx,
          );
          return toView(after);
        });
      } catch (error: unknown) {
        if (!retriable(error)) return mapPrismaError(error);
        if (attempt >= MAX_ATTEMPTS) throw new ConflictException(ACHIEVEMENT_MSG.busy);
      }
    }
  }
}
