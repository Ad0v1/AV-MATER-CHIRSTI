import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('ReportsAudit');

/**
 * Bitácora de reportes (RNF-14): module 'reports', acción 'reports.export.request'. Solo ids,
 * tipo y formato; nunca nombres ni notas. Después de encolar; nunca lanza (la descarga deja su
 * propia fila job.download).
 */
export async function recordExportRequest(
  audit: AuditService,
  actor: Actor,
  entity: { type: 'CourseSection' | 'AcademicYear'; id: string },
  after: Record<string, unknown>,
): Promise<void> {
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'reports',
      action: 'reports.export.request',
      entityType: entity.type,
      entityId: entity.id,
      afterState: after,
    });
  } catch (error: unknown) {
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
