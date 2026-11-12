import { Logger } from '@nestjs/common';
import type { AuditEvent, AuditService, AuditTx } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

export type ContentsEntity = 'Assignment' | 'Material';

const logger = new Logger('ContentsAudit');

/**
 * Bitácora de contenidos: después del commit, module 'contents', action
 * 'contents.<entidad>.<verbo>' (p. ej. 'contents.assignment.created'). Solo ids y configuración:
 * nunca títulos, instrucciones ni nombres de archivo. Sin `tx` nunca lanza (el cambio ya está confirmado); con `tx` relanza (D-047),
 * igual que recordAcademic.
 */
export async function recordContents(
  audit: AuditService,
  actor: Actor,
  action: string,
  entityType: ContentsEntity,
  entityId: string,
  states: { before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
  tx?: AuditTx, // D-047: con tx se escribe dentro de la transaccion y el fallo la revierte
): Promise<void> {
  const fullAction = `contents.${action}`;
  try {
    const event: AuditEvent = {
      actorId: actor.id,
      ip: actor.ip,
      module: 'contents',
      action: fullAction,
      entityType,
      entityId,
      beforeState: states.before,
      afterState: states.after,
    };
    // Sin tx se llama con un solo argumento (firma de siempre).
    await (tx ? audit.record(event, tx) : audit.record(event));
  } catch (error: unknown) {
    if (tx) throw error;
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
