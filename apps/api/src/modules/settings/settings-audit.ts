import { Logger } from '@nestjs/common';
import type { AuditEvent, AuditService, AuditTx } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('SettingsAudit');

/**
 * Bitácora de la configuración (RF-61, RNF-14): module 'settings', entityType
 * 'InstitutionSettings', entityId '1'. Solo nombres de campos y valores de configuración (plazo
 * y tabla); nunca el nombre del archivo del logo. Después del commit; nunca lanza.
 */
export async function recordSettings(
  audit: AuditService,
  actor: Actor,
  action: 'settings.update' | 'settings.logo.update',
  states: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  tx?: AuditTx, // D-047: con tx se escribe dentro de la transaccion y el fallo la revierte
): Promise<void> {
  try {
    const event: AuditEvent = {
      actorId: actor.id,
      ip: actor.ip,
      module: 'settings',
      action,
      entityType: 'InstitutionSettings',
      entityId: '1',
      beforeState: states.before,
      afterState: states.after,
    };
    // Sin tx se llama con un solo argumento (firma de siempre).
    await (tx ? audit.record(event, tx) : audit.record(event));
  } catch (error: unknown) {
    if (tx) throw error;
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action,
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
