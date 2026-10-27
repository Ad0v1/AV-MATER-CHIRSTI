import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

export type UsersEntity = 'User' | 'Enrollment' | 'GuardianStudent';

const logger = new Logger('UsersAudit');

/**
 * Bitácora del módulo users (Decisión 5): después del commit, module 'users',
 * action 'users.<entidad>.<verbo>', solo ids, estados, motivos y nombres de campos cambiados
 * (nunca correos ni nombres de personas: RNF-09/11, D-024).
 *
 * entityType y entityId son opcionales para los eventos sin una entidad raíz única (p. ej. la
 * importación masiva, 'users.import.commit', que lleva los ids creados en afterState).
 *
 * Nunca lanza: el cambio ya está confirmado. Un fallo se registra en el log solo con action,
 * entityType, entityId y actorId. Corrección real pendiente de Dev 1: record(event, tx).
 */
export async function recordUsers(
  audit: AuditService,
  actor: Actor,
  action: string,
  entityType?: UsersEntity,
  entityId?: string,
  states: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
): Promise<void> {
  const fullAction = `users.${action}`;
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'users',
      action: fullAction,
      entityType,
      entityId,
      beforeState: states.before,
      afterState: states.after,
    });
  } catch (error: unknown) {
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
