import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { GradeAuditState } from './grading.policy.js';

const logger = new Logger('GradingAudit');

/**
 * Bitácora de calificaciones (U3): después del commit, module 'grading', entityType 'Grade'.
 * Solo {state, value, source} antes/después y changedFields: nunca el comentario ni el motivo de
 * exoneración (U2). actorId undefined = sistema (NE AUTO). Nunca lanza.
 */
export async function recordGrading(
  audit: AuditService,
  actor: { id?: string; ip?: string },
  action: 'grade.create' | 'grade.update' | 'grade.auto_ne',
  gradeId: string,
  states: {
    before?: GradeAuditState | null;
    after: GradeAuditState;
    changedFields: string[];
    assignmentId: string;
    enrollmentId: string;
  },
): Promise<void> {
  const fullAction = `grading.${action}`;
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'grading',
      action: fullAction,
      entityType: 'Grade',
      entityId: gradeId,
      beforeState: states.before ?? undefined,
      afterState: {
        ...states.after,
        assignmentId: states.assignmentId,
        enrollmentId: states.enrollmentId,
        changedFields: states.changedFields,
      },
    });
  } catch (error: unknown) {
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action: fullAction,
        entityId: gradeId,
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
