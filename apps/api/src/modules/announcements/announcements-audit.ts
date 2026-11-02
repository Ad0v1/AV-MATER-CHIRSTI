import { Logger } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
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
): Promise<void> {
  try {
    await audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'announcements',
      action,
      entityType: 'Announcement',
      entityId: announcementId,
      afterState: after,
    });
  } catch (error: unknown) {
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action,
        announcementId,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
