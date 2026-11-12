import { Logger } from '@nestjs/common';
import type { AuditEvent, AuditService, AuditTx } from '../../common/audit/audit.service.js';
import type { Actor } from '../academic/request-user.js';

const logger = new Logger('AnnouncementsAudit');

export type AnnouncementAuditAction =
  'announcement.create' | 'announcement.update' | 'announcement.delete';

/**
 * Bitácora de anuncios (RF-32, RNF-14): module 'announcements', entityType 'Announcement'.
 * Solo alcance, ids y nombres de campos cambiados: nunca el título ni el cuerpo (pueden traer
 * datos de menores). Después del commit; nunca lanza.
 */
export async function recordAnnouncement(
  audit: AuditService,
  actor: Actor,
  action: AnnouncementAuditAction,
  announcementId: string,
  after: Record<string, unknown>,
  tx?: AuditTx, // D-047: con tx se escribe dentro de la transaccion y el fallo la revierte
): Promise<void> {
  try {
    const event: AuditEvent = {
      actorId: actor.id,
      ip: actor.ip,
      module: 'announcements',
      action,
      entityType: 'Announcement',
      entityId: announcementId,
      afterState: after,
    };
    // Sin tx se llama con un solo argumento (firma de siempre).
    await (tx ? audit.record(event, tx) : audit.record(event));
  } catch (error: unknown) {
    if (tx) throw error;
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action,
        announcementId,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
