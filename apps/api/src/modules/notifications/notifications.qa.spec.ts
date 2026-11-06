import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { NotificationsController } from './notifications.controller.js';
import { notificationsQuerySchema } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

// QA de 5d (RF-53): aislamiento entre personas, read-all, paginación y validación de la consulta.

type Notif = {
  id: string;
  recipientId: string;
  readAt: Date | null;
  type: string;
  entityId: string;
};

/** Base falsa con dos personas: respeta recipientId/readAt como lo haría MySQL. */
function world() {
  const rows: Notif[] = [
    { id: 'a1', recipientId: 'ana', readAt: null, type: 'ANNOUNCEMENT_PUBLISHED', entityId: 'x' },
    { id: 'a2', recipientId: 'ana', readAt: null, type: 'ANNOUNCEMENT_PUBLISHED', entityId: 'x' },
    { id: 'b1', recipientId: 'beto', readAt: null, type: 'ANNOUNCEMENT_PUBLISHED', entityId: 'x' },
    {
      id: 'b2',
      recipientId: 'beto',
      readAt: new Date(),
      type: 'ANNOUNCEMENT_PUBLISHED',
      entityId: 'x',
    },
  ];
  type W = { id?: string; recipientId?: string; readAt?: null };
  const match = (r: Notif, w: W) =>
    (w.id === undefined || r.id === w.id) &&
    (w.recipientId === undefined || r.recipientId === w.recipientId) &&
    (w.readAt === undefined || r.readAt === null);
  const prisma = {
    notification: {
      count: vi.fn(({ where }: { where: W }) =>
        Promise.resolve(rows.filter((r) => match(r, where)).length),
      ),
      findMany: vi.fn(({ where, skip, take }: { where: W; skip: number; take: number }) =>
        Promise.resolve(
          rows
            .filter((r) => match(r, where))
            .slice(skip, skip + take)
            .map((r) => ({ ...r, createdAt: new Date() })),
        ),
      ),
      findFirst: vi.fn(({ where }: { where: W }) =>
        Promise.resolve(rows.find((r) => match(r, where)) ?? null),
      ),
      updateMany: vi.fn(({ where, data }: { where: W; data: { readAt: Date } }) => {
        const hit = rows.filter((r) => match(r, where));
        for (const r of hit) r.readAt = data.readAt;
        return Promise.resolve({ count: hit.length });
      }),
    },
    enrollment: { findMany: vi.fn(() => Promise.resolve([])) },
    assignment: { findMany: vi.fn(() => Promise.resolve([])) },
    grade: { findMany: vi.fn(() => Promise.resolve([])) },
    announcement: { findMany: vi.fn(() => Promise.resolve([])) },
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    { getLinkedStudentIds: vi.fn(() => Promise.resolve([])) } as unknown as AcademicAccessService,
  );
  return { rows, prisma, service };
}

const ana = { id: 'ana', role: 'STUDENT' as const };
const beto = { id: 'beto', role: 'GUARDIAN' as const };

describe('RF-53: una persona no ve ni marca los avisos de otra', () => {
  it('RF-53: list devuelve solo los propios y el contador es el propio', async () => {
    const { service } = world();
    const a = await service.list(ana, { unread: false, page: 1 });
    expect(a.items.map((i) => i.id)).toEqual(['a1', 'a2']);
    expect(a).toMatchObject({ total: 2, unreadCount: 2 });
    const b = await service.list(beto, { unread: false, page: 1 });
    expect(b.items.map((i) => i.id)).toEqual(['b1', 'b2']);
    expect(b).toMatchObject({ total: 2, unreadCount: 1 });
  });

  it('RF-53: unread=true solo trae las no leídas propias', async () => {
    const { service } = world();
    const b = await service.list(beto, { unread: true, page: 1 });
    expect(b.items.map((i) => i.id)).toEqual(['b1']);
    expect(b.total).toBe(1);
  });

  it('RF-53: marcar leído el aviso de otra persona → 404 y el aviso ajeno queda intacto', async () => {
    const { service, rows } = world();
    await expect(service.markRead(ana, 'b1')).rejects.toBeInstanceOf(NotFoundException);
    expect(rows.find((r) => r.id === 'b1')?.readAt).toBeNull();
  });

  it('RF-53: un id inexistente da el mismo 404 que uno ajeno (no revela existencia)', async () => {
    const { service } = world();
    const ajena = await service.markRead(ana, 'b1').catch((e: NotFoundException) => e);
    const falsa = await service.markRead(ana, 'no-existe').catch((e: NotFoundException) => e);
    expect((ajena as NotFoundException).getStatus()).toBe(404);
    expect((ajena as NotFoundException).message).toBe((falsa as NotFoundException).message);
  });

  it('RF-53: marcar la propia funciona y repetirla es idempotente (sin 404)', async () => {
    const { service, rows } = world();
    await service.markRead(ana, 'a1');
    const first = rows.find((r) => r.id === 'a1')?.readAt;
    expect(first).toBeInstanceOf(Date);
    await expect(service.markRead(ana, 'a1')).resolves.toBeUndefined();
    expect(rows.find((r) => r.id === 'a1')?.readAt).toBe(first);
  });

  it('RF-53: read-all marca solo las propias no leídas y no toca las de otras personas', async () => {
    const { service, rows } = world();
    expect(await service.markAllRead(ana)).toEqual({ updated: 2 });
    expect(rows.filter((r) => r.recipientId === 'ana').every((r) => r.readAt !== null)).toBe(true);
    expect(rows.find((r) => r.id === 'b1')?.readAt).toBeNull();
    expect(await service.markAllRead(ana)).toEqual({ updated: 0 });
    expect(await service.markAllRead(beto)).toEqual({ updated: 1 });
  });

  it('RF-53: el destinatario siempre sale de la sesión; el controlador no acepta ids de persona', () => {
    const params = (m: keyof NotificationsController) =>
      NotificationsController.prototype[m].length;
    expect(params('list')).toBe(2);
    expect(params('readAll')).toBe(1);
    expect(params('read')).toBe(2);
  });
});

describe('RF-53: paginación', () => {
  it('RF-53: 45 avisos → página 1 trae 20, página 3 trae 5, página 4 vacía; total estable', async () => {
    const { rows, service } = world();
    rows.length = 0;
    for (let i = 0; i < 45; i++) {
      rows.push({
        id: `n${i}`,
        recipientId: 'ana',
        readAt: null,
        type: 'ANNOUNCEMENT_PUBLISHED',
        entityId: 'x',
      });
    }
    const size = async (page: number) =>
      (await service.list(ana, { unread: false, page })).items.length;
    expect([await size(1), await size(2), await size(3), await size(4)]).toEqual([20, 20, 5, 0]);
    expect(await service.list(ana, { unread: false, page: 4 })).toMatchObject({
      page: 4,
      pageSize: 20,
      total: 45,
      unreadCount: 45,
    });
  });

  it('RF-53: exactamente 20 avisos caben en una página; el 21 pasa a la segunda', async () => {
    const { rows, service } = world();
    rows.length = 0;
    for (let i = 0; i < 21; i++) {
      rows.push({
        id: `n${i}`,
        recipientId: 'ana',
        readAt: null,
        type: 'ANNOUNCEMENT_PUBLISHED',
        entityId: 'x',
      });
    }
    expect((await service.list(ana, { unread: false, page: 1 })).items).toHaveLength(20);
    expect((await service.list(ana, { unread: false, page: 2 })).items).toHaveLength(1);
  });
});

describe('RF-53: validación de GET /me/notifications', () => {
  it('RF-53: page 1..500; 0, 501, decimales y texto fallan; por defecto 1', () => {
    expect(notificationsQuerySchema.parse({})).toEqual({ unread: false, page: 1 });
    expect(notificationsQuerySchema.parse({ page: '500' }).page).toBe(500);
    for (const page of ['0', '501', '1.5', 'x', '-1']) {
      expect(notificationsQuerySchema.safeParse({ page }).success, page).toBe(false);
    }
  });

  it('RF-53: unread solo acepta true o false; otros campos se rechazan (strict)', () => {
    expect(notificationsQuerySchema.parse({ unread: 'true' }).unread).toBe(true);
    expect(notificationsQuerySchema.parse({ unread: 'false' }).unread).toBe(false);
    expect(notificationsQuerySchema.safeParse({ unread: '1' }).success).toBe(false);
    expect(notificationsQuerySchema.safeParse({ recipientId: 'beto' }).success).toBe(false);
  });
});
