'use server';

// Campana de avisos (RF-53) como Server Actions (D-037). El destinatario es siempre el usuario de
// la sesión (la API no recibe ids de otras personas); aquí solo se valida la forma.
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import type { NotificationPage } from './notifications';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadResult = { ok: true; page: NotificationPage } | { ok: false; message: string };
export type MarkResult = { ok: true } | { ok: false; message: string };

export async function loadNotifications(page: unknown): Promise<LoadResult> {
  const n =
    typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1;
  try {
    return { ok: true, page: await apiServer.get<NotificationPage>(`/me/notifications?page=${n}`) };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function markNotificationRead(id: unknown): Promise<MarkResult> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, message: 'Aviso no válido.' };
  try {
    await apiServer.post(`/me/notifications/${id}/read`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function markAllNotificationsRead(): Promise<MarkResult> {
  try {
    await apiServer.post('/me/notifications/read-all');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
