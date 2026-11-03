import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from './request-user.js';

export type AcademicEntity =
  'AcademicYear' | 'AcademicPeriod' | 'Section' | 'Course' | 'CourseSection';

const logger = new Logger('AcademicAudit');

/**
 * Bitácora de acciones académicas (Decisión 5): siempre después del commit, module 'academic',
 * action 'academic.<entidad>.<verbo>', solo ids y campos cambiados (nunca nombres ni correos).
 *
 * Nunca lanza: el cambio ya está confirmado, así que un fallo de la bitácora no convierte la
 * respuesta en 500 ni impide publicar el evento. Se registra con Logger.error solo con action,
 * entityType, entityId y actorId (sin before/after, que pueden tener datos). Corrección real
 * pendiente de Dev 1: AuditService.record(event, tx) dentro de la misma transacción.
 */
export async function recordAcademic(
  audit: AuditService,
  actor: Actor,
  action: string,
  entityType: AcademicEntity,
  entityId: string,
  states: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
): Promise<void> {
  const fullAction = `academic.${action}`;
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'academic',
      action: fullAction,
      entityType,
      entityId,
      beforeState: states.before,
      afterState: states.after,
    });
  } catch (error: unknown) {
    // Solo el tipo y el código del error: el mensaje podría arrastrar valores del registro.
    const code = (error as { code?: unknown } | null)?.code;
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action: fullAction,
        entityType,
        entityId,
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
        code: typeof code === 'string' ? code : undefined,
      })}`,
    );
  }
}
