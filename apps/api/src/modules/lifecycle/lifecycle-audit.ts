import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('LifecycleAudit');

export type LifecycleAction =
  | 'lifecycle.personal_data_export.request'
  | 'lifecycle.backup.enqueue'
  | 'lifecycle.purge.enqueue'
  | 'lifecycle.purge';

/**
 * Bitácora del ciclo de vida (RF-63, RF-65, RF-66; RNF-14): module 'lifecycle'. Solo ids,
 * conteos y fechas: nunca nombres, correos ni contenido de los archivos. actor null = sistema
 * (listener del cierre de año, barrido diario, worker). Después del cambio; nunca lanza.
 */
export async function recordLifecycle(
  audit: AuditService,
  actor: Actor | null,
  action: LifecycleAction,
  entity: { type: 'User' | 'AcademicYear'; id: string },
  after: Record<string, unknown>,
): Promise<void> {
  try {
    await audit.record({
      actorId: actor?.id,
      ip: actor?.ip,
      module: 'lifecycle',
      action,
      entityType: entity.type,
      entityId: entity.id,
      afterState: after,
    });
  } catch (error: unknown) {
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action,
        actorId: actor?.id ?? null,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
