import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api/server', () => ({ apiServer: api }));

import { ApiError } from '@/lib/api/errors';
import { loadNotifications, markAllNotificationsRead, markNotificationRead } from './actions';

const ID = '0190a6f0-0000-7000-8000-000000000001';
const page = { items: [], page: 1, pageSize: 20, total: 0, unreadCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(page);
  api.post.mockResolvedValue(undefined);
});

describe('Server Actions de la campana (RF-53)', () => {
  it('RF-53: loadNotifications pide la página válida y cae en 1 si el valor es raro', async () => {
    await loadNotifications(3);
    expect(api.get).toHaveBeenLastCalledWith('/me/notifications?page=3');
    for (const bad of [0, 501, 1.5, '2', NaN, null, undefined, '1&recipientId=otro']) {
      await loadNotifications(bad);
      expect(api.get).toHaveBeenLastCalledWith('/me/notifications?page=1');
    }
    await loadNotifications(500);
    expect(api.get).toHaveBeenLastCalledWith('/me/notifications?page=500');
  });

  it('RF-53: loadNotifications devuelve el error de la API como mensaje', async () => {
    api.get.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'fallo'));
    const r = await loadNotifications(1);
    expect(r.ok).toBe(false);
  });

  it('RF-53: markNotificationRead solo acepta uuid (no se inyectan rutas)', async () => {
    for (const bad of ['x', '../read-all', `${ID}/../x`, 7, null, undefined]) {
      expect(await markNotificationRead(bad)).toEqual({ ok: false, message: 'Aviso no válido.' });
    }
    expect(api.post).not.toHaveBeenCalled();
    expect(await markNotificationRead(ID)).toEqual({ ok: true });
    expect(api.post).toHaveBeenCalledWith(`/me/notifications/${ID}/read`);
  });

  it('RF-53: un 404 (aviso de otra persona) vuelve como error, no como éxito', async () => {
    api.post.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No existe'));
    expect((await markNotificationRead(ID)).ok).toBe(false);
  });

  it('RF-53: markAllNotificationsRead llama a read-all sin parámetros', async () => {
    expect(await markAllNotificationsRead()).toEqual({ ok: true });
    expect(api.post).toHaveBeenCalledWith('/me/notifications/read-all');
    api.post.mockRejectedValueOnce(new ApiError(429, 'THROTTLED', 'Demasiadas'));
    expect((await markAllNotificationsRead()).ok).toBe(false);
  });
});
