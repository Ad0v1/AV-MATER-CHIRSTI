import { Logger } from '@nestjs/common';
import type { AuditEvent, AuditService, AuditTx } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('FilesAudit');

export type FilesAction =
  | 'upload-intent.created'
  | 'upload.accepted'
  | 'upload.rejected'
  | 'upload.expired'
  | 'download-url.issued'
  | 'file.purge';

/**
 * Bitácora del módulo de archivos: module 'files', action 'files.<verbo>', entityType
 * 'StoredFile'. Solo ids, propósito, tamaños, sha256 y códigos de rechazo: NUNCA el nombre
 * original del archivo (puede tener el nombre del alumno) ni la firma del antivirus.
 * Sin `tx` nunca lanza (igual que recordAcademic); con `tx` relanza (D-047).
 */
export async function recordFiles(
  audit: AuditService,
  actor: Actor | null, // null = sistema (barridos y purga del worker)
  action: FilesAction,
  fileId: string,
  after: Record<string, unknown>,
  tx?: AuditTx, // D-047: con tx se escribe dentro de la transaccion y el fallo la revierte
): Promise<void> {
  const fullAction = `files.${action}`;
  try {
    const event: AuditEvent = {
      actorId: actor?.id,
      ip: actor?.ip,
      module: 'files',
      action: fullAction,
      entityType: 'StoredFile',
      entityId: fileId,
      afterState: after,
    };
    // Sin tx se llama con un solo argumento (firma de siempre).
    await (tx ? audit.record(event, tx) : audit.record(event));
  } catch (error: unknown) {
    if (tx) throw error;
    const code = (error as { code?: unknown } | null)?.code;
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action: fullAction,
        entityId: fileId,
        actorId: actor?.id ?? null,
        error: error instanceof Error ? error.name : typeof error,
        code: typeof code === 'string' ? code : undefined,
      })}`,
    );
  }
}
