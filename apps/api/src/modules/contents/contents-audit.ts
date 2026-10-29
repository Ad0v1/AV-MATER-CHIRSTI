import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

export type ContentsEntity = 'Assignment' | 'Material';

const logger = new Logger('ContentsAudit');

/**
 * Bitácora de contenidos: después del commit, module 'contents', action
 * 'contents.<entidad>.<verbo>' (p. ej. 'contents.assignment.created'). Solo ids y configuración:
 * nunca títulos, instrucciones ni nombres de archivo. Nunca lanza (el cambio ya está confirmado),
 * igual que recordAcademic.
 */
export async function recordContents(
  audit: AuditService,
  actor: Actor,
  action: string,
  entityType: ContentsEntity,
  entityId: string,
  states: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
): Promise<void> {
  const fullAction = `contents.${action}`;
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'contents',
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
