import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('FilesAudit');

export type FilesAction =
  | 'upload-intent.created'
  | 'upload.accepted'
  | 'upload.rejected'
  | 'upload.expired'
  | 'download-url.issued';

/**
 * Bitácora del módulo de archivos: module 'files', action 'files.<verbo>', entityType
 * 'StoredFile'. Solo ids, propósito, tamaños, sha256 y códigos de rechazo: NUNCA el nombre
 * original del archivo (puede tener el nombre del alumno) ni la firma del antivirus.
 * Nunca lanza (igual que recordAcademic): el cambio ya está confirmado.
 */
export async function recordFiles(
  audit: AuditService,
  actor: Actor,
  action: FilesAction,
  fileId: string,
  after: Record<string, unknown>,
): Promise<void> {
  const fullAction = `files.${action}`;
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'files',
      action: fullAction,
      entityType: 'StoredFile',
      entityId: fileId,
      afterState: after,
    });
  } catch (error: unknown) {
    const code = (error as { code?: unknown } | null)?.code;
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action: fullAction,
        entityId: fileId,
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
        code: typeof code === 'string' ? code : undefined,
      })}`,
    );
  }
}
