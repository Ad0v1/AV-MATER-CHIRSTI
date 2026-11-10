import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { dedupeKey } from './notification.constants.js';
import { NotificationsService } from './notifications.service.js';

const created = new Date('2026-05-01T12:00:00Z');
const n = (id: string, type: string, entityId: string) => ({
  id,
  type,
  entityId,
  createdAt: created,
  readAt: null,
});
const course = { courseSection: { sectionId: 'sec-1', course: { name: 'Matemática' } } };

function setup(opts: { rows?: ReturnType<typeof n>[]; linked?: string[] } = {}) {
  const prisma = {
    enrollment: {
      findMany: vi.fn(() =>
        Promise.resolve([{ sectionId: 'sec-1', section: { level: 'SECUNDARIA', gradeLevel: 3 } }]),
      ),
    },
    notification: {
      count: vi.fn(() => Promise.resolve(3)),
      findMany: vi.fn(() => Promise.resolve(opts.rows ?? [])),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      findFirst: vi.fn(() => Promise.resolve(null)),
    },
    assignment: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: 'a1',
            title: 'Fracciones',
            dueAt: new Date('2026-05-02T04:59:00Z'),
            deletedAt: null,
            courseSectionId: 'cs-1',
            ...course,
          },
          {
            id: 'a2',
            title: 'Borrada',
            dueAt: created,
            deletedAt: created,
            courseSectionId: 'cs-1',
            ...course,
          },
        ]),
      ),
    },
    grade: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: 'g1',
            enrollment: { student: { id: 'st-1', fullName: 'Ana Pérez' } },
            assignment: {
              title: 'Fracciones',
              dueAt: created,
              deletedAt: null,
              courseSectionId: 'cs-1',
              ...course,
            },
          },
        ]),
      ),
    },
    announcement: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: 'n1',
            title: 'Feria',
            deletedAt: null,
            scope: 'INSTITUTION',
            level: null,
            gradeLevel: null,
            courseSectionId: null,
            courseSection: null,
          },
          {
            id: 'n2',
            title: 'Retirado',
            deletedAt: created,
            scope: 'INSTITUTION',
            level: null,
            gradeLevel: null,
            courseSectionId: null,
            courseSection: null,
          },
        ]),
      ),
    },
  };
  const access = { getLinkedStudentIds: vi.fn(() => Promise.resolve(opts.linked ?? [])) };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    access as unknown as AcademicAccessService,
  );
  return { service, prisma, access };
}

describe('NotificationsService (RF-53)', () => {
  it('lista solo las del usuario de la sesión, con unread y página', async () => {
    const { service, prisma } = setup();
    const page = await service.list({ id: 'u1', role: 'STUDENT' }, { unread: true, page: 2 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'u1', readAt: null },
        skip: 20,
        take: 20,
      }),
    );
    expect(page).toMatchObject({ page: 2, pageSize: 20, total: 3, unreadCount: 3, items: [] });
  });

  it('arma el mensaje al leer; tarea retirada → genérico sin enlace', async () => {
    const { service } = setup({
      rows: [n('1', 'ASSIGNMENT_CREATED', 'a1'), n('2', 'ASSIGNMENT_DUE_SOON', 'a2')],
    });
    const { items } = await service.list(
      { id: 'st-1', role: 'STUDENT' },
      { unread: false, page: 1 },
    );
    expect(items[0]).toMatchObject({ target: 'ASSIGNMENT', courseSectionId: 'cs-1' });
    expect(items[0].message).toContain('«Fracciones»');
    expect(items[0].message).toContain('Matemática');
    expect(items[0].message).toContain('hora de Lima');
    expect(items[1]).toMatchObject({
      target: null,
      courseSectionId: null,
      message: 'Una tarea ya no está disponible.',
    });
  });

  it('nota: el estudiante dueño ve el detalle, nunca el valor', async () => {
    const { service } = setup({ rows: [n('1', 'GRADE_PUBLISHED', 'g1')] });
    const { items } = await service.list(
      { id: 'st-1', role: 'STUDENT' },
      { unread: false, page: 1 },
    );
    expect(items[0]).toMatchObject({ target: 'GRADE', studentId: null });
    expect(items[0].message).toBe('Nueva calificación en «Fracciones» (Matemática).');
  });

  it('nota: apoderado con vínculo vigente ve el nombre de su estudiante; sin vínculo, genérico', async () => {
    const linked = setup({ rows: [n('1', 'GRADE_PUBLISHED', 'g1')], linked: ['st-1'] });
    const a = await linked.service.list(
      { id: 'g-1', role: 'GUARDIAN' },
      { unread: false, page: 1 },
    );
    expect(a.items[0]).toMatchObject({ target: 'GRADE', studentId: 'st-1' });
    expect(a.items[0].message).toContain('de Ana Pérez');

    const revoked = setup({ rows: [n('1', 'GRADE_PUBLISHED', 'g1')], linked: [] });
    const b = await revoked.service.list(
      { id: 'g-1', role: 'GUARDIAN' },
      { unread: false, page: 1 },
    );
    expect(b.items[0]).toMatchObject({
      target: null,
      studentId: null,
      message: 'Hay una calificación nueva.',
    });
    expect(JSON.stringify(b.items)).not.toContain('Ana');
  });

  it('nota de otro estudiante (defensa) → genérico', async () => {
    const { service } = setup({ rows: [n('1', 'GRADE_PUBLISHED', 'g1')] });
    const { items } = await service.list(
      { id: 'st-9', role: 'STUDENT' },
      { unread: false, page: 1 },
    );
    expect(items[0].message).toBe('Hay una calificación nueva.');
  });

  it('anuncio vigente y retirado', async () => {
    const { service } = setup({
      rows: [n('1', 'ANNOUNCEMENT_PUBLISHED', 'n1'), n('2', 'ANNOUNCEMENT_PUBLISHED', 'n2')],
    });
    const { items } = await service.list(
      { id: 'st-1', role: 'STUDENT' },
      { unread: false, page: 1 },
    );
    expect(items[0]).toMatchObject({ target: 'ANNOUNCEMENT', message: 'Nuevo anuncio: «Feria».' });
    expect(items[1]).toMatchObject({ target: null, message: 'Un anuncio fue retirado.' });
  });

  it('markRead filtra por destinatario; ajena o inexistente → 404; ya leída → ok', async () => {
    const { service, prisma } = setup();
    await service.markRead({ id: 'u1', role: 'STUDENT' }, 'n-1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', recipientId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.markRead({ id: 'u1', role: 'STUDENT' }, 'n-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.notification.findFirst.mockResolvedValueOnce({ id: 'n-3' } as never);
    await expect(service.markRead({ id: 'u1', role: 'STUDENT' }, 'n-3')).resolves.toBeUndefined();
  });

  it('markAllRead solo toca las propias no leídas', async () => {
    const { service, prisma } = setup();
    await expect(service.markAllRead({ id: 'u1', role: 'GUARDIAN' })).resolves.toEqual({
      updated: 1,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('dedupeKey', () => {
  it('tipo, entidad, variante y destinatario; cabe en VARCHAR(191)', () => {
    const id = '0190a6f0-0000-7000-8000-000000000001';
    expect(dedupeKey('ASSIGNMENT_CREATED', id, id)).toBe(`ac:${id}:${id}`);
    const k = dedupeKey('ASSIGNMENT_DUE_SOON', id, id, '1777777777');
    expect(k).toBe(`ds:${id}:1777777777:${id}`);
    expect(k.length).toBeLessThanOrEqual(191);
  });
});
