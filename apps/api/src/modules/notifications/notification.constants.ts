import type { NotificationType } from '../../generated/prisma/enums.js';

// Avisos de Dev 5 (RF-53, U2, U3). Los listeners de la API encolan en la cola `notifications` un
// trabajo idempotente (jobId fijo por evento) con solo ids; el worker resuelve los destinatarios,
// crea las Notification (dedupeKey único por destinatario) y encola los correos en lotes.

/** Nombres de los trabajos de la cola notifications (aparte de mail-check de 5b). */
export const NOTIFICATION_JOBS = {
  assignmentCreated: 'assignment-created',
  assignmentDueCheck: 'assignment-due-check',
  gradePublished: 'grade-published',
  announcementPublished: 'announcement-published',
  sendEmail: 'send-email',
} as const;

/** Correos por trabajo send-email (INFORME 5: lotes de 50 a 100). */
export const EMAIL_BATCH = 100;
/** Tope de destinatarios por evento (INFORME 17): por encima se corta y se registra en el log. */
export const MAX_RECIPIENTS_PER_EVENT = 20_000;
/** Filas por createMany / consulta IN. */
export const INSERT_CHUNK = 500;

/** Ventana del aviso "por vencer": tareas que vencen dentro de las próximas 24 h. */
export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Tope de tareas por corrida del barrido due-soon. */
export const DUE_SOON_MAX_ASSIGNMENTS = 2000;

/** Retención (INFORME 5, hallazgo 1). */
export const RETENTION = {
  readDays: 90,
  unreadDays: 180,
  maxDays: 365,
  emailRetryDays: 7,
  batch: 1000,
} as const;

const PREFIX: Record<NotificationType, string> = {
  ASSIGNMENT_CREATED: 'ac',
  ASSIGNMENT_DUE_SOON: 'ds',
  GRADE_PUBLISHED: 'gp',
  ANNOUNCEMENT_PUBLISHED: 'an',
};

/**
 * Clave de deduplicación (Notification.dedupeKey, VARCHAR(191)): tipo, entidad, variante y
 * destinatario. `variant` distingue avisos de la misma entidad (p. ej. el plazo en segundos del
 * aviso "por vencer": si el docente mueve el plazo, se vuelve a avisar). Máximo ~100 caracteres.
 */
export function dedupeKey(
  type: NotificationType,
  entityId: string,
  recipientId: string,
  variant?: string,
): string {
  return [PREFIX[type], entityId, variant, recipientId].filter((p) => p !== undefined).join(':');
}
