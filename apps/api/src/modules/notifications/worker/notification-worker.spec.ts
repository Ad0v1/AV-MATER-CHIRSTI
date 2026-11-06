import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import type { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { MailerService } from '../../jobs/mailer.service.js';
import { JobProcessorRegistry } from '../../jobs/processor.registry.js';
import type { QueueService } from '../../queue/index.js';
import { DueSoonNotifier, jobUuid } from './event-notification.processors.js';
import { NotificationRetentionProcessor } from './maintenance.processors.js';
import { NotificationFanout } from './notification-fanout.service.js';
import type { NotificationRecipients } from './notification-recipients.service.js';
import { SendEmailProcessor } from './send-email.processor.js';

const uuid = (n: number) => `0190a6f0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const job = (data: unknown, attemptsMade = 0, attempts = 3) =>
  ({ data, attemptsMade, opts: { attempts } }) as unknown as Job;

describe('jobUuid', () => {
  it('acepta uuid y rechaza otro dato sin reintentar', () => {
    expect(jobUuid({ a: uuid(1) }, 'a')).toBe(uuid(1));
    expect(() => jobUuid({ a: 'x' }, 'a')).toThrow(UnrecoverableError);
  });
});

describe('NotificationFanout', () => {
  function setup(users: { id: string; contactEmail: string; emailVerifiedAt: Date }[]) {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      user: {
        findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(users.filter((u) => where.id.in.includes(u.id))),
        ),
      },
      notification: {
        createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
          created.push(...data);
          return Promise.resolve({ count: data.length });
        }),
        findMany: vi.fn(({ where }: { where: { dedupeKey: { in: string[] } } }) =>
          Promise.resolve(
            created
              .filter((c) => where.dedupeKey.in.includes(c.dedupeKey as string))
              .filter((c) => c.emailStatus === 'PENDING')
              .map((c) => ({ id: `n-${c.recipientId as string}` })),
          ),
        ),
      },
    };
    const enqueue = vi.fn(() => Promise.resolve('j'));
    const fanout = new NotificationFanout(
      prisma as unknown as PrismaService,
      { enqueue } as unknown as QueueService,
    );
    return { fanout, prisma, enqueue, created };
  }

  it('crea un aviso por destinatario ACTIVE con skipDuplicates; sin correo válido → SKIPPED', async () => {
    const { fanout, prisma, created, enqueue } = setup([
      { id: 'u1', contactEmail: 'a@colegio.example', emailVerifiedAt: new Date() },
      { id: 'u2', contactEmail: 'sin-correo', emailVerifiedAt: new Date() },
    ]);
    const res = await fanout.notify('ANNOUNCEMENT_PUBLISHED', uuid(9), ['u1', 'u2', 'u1', 'u3']);
    expect(res).toEqual({ recipients: 3, created: 2, emailJobs: 1 });
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(created.map((c) => c.emailStatus)).toEqual(['PENDING', 'SKIPPED']);
    expect(created[0].dedupeKey).toBe(`an:${uuid(9)}:u1`);
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'send-email',
      { notificationIds: ['n-u1'] },
      { jobId: expect.stringMatching(/^send-email-[0-9a-f]{48}$/) },
    );
  });

  it('INSTITUTION: correos en lotes de 100 con jobId estable', async () => {
    const users = Array.from({ length: 250 }, (_, i) => ({
      id: `u${String(i).padStart(3, '0')}`,
      contactEmail: `e${i}@colegio.example`,
      emailVerifiedAt: new Date(),
    }));
    const a = setup(users);
    await a.fanout.notify(
      'ANNOUNCEMENT_PUBLISHED',
      uuid(1),
      users.map((u) => u.id),
    );
    const sizes = a.enqueue.mock.calls.map(
      (c) => ((c as unknown[])[2] as { notificationIds: string[] }).notificationIds.length,
    );
    expect(sizes).toEqual([100, 100, 50]);
    const b = setup(users);
    await b.fanout.notify(
      'ANNOUNCEMENT_PUBLISHED',
      uuid(1),
      users.map((u) => u.id),
    );
    expect(b.enqueue.mock.calls.map((c) => (c as unknown[])[3])).toEqual(
      a.enqueue.mock.calls.map((c) => (c as unknown[])[3]),
    );
  });

  it('sin destinatarios no consulta ni encola', async () => {
    const { fanout, prisma, enqueue } = setup([]);
    expect(await fanout.notify('GRADE_PUBLISHED', uuid(1), [])).toEqual({
      recipients: 0,
      created: 0,
      emailJobs: 0,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('DueSoonNotifier', () => {
  const now = new Date('2026-05-01T12:00:00Z');
  function setup(dueAt: Date | null) {
    const recipients = {
      assignment: vi.fn(() =>
        Promise.resolve(dueAt ? { id: uuid(1), dueAt, courseSection: { sectionId: 's' } } : null),
      ),
      forAssignment: vi.fn(() => Promise.resolve(['st-1'])),
    };
    const fanout = {
      notify: vi.fn(() => Promise.resolve({ recipients: 1, created: 1, emailJobs: 1 })),
    };
    const notifier = new DueSoonNotifier(
      recipients as unknown as NotificationRecipients,
      fanout as unknown as NotificationFanout,
    );
    return { notifier, recipients, fanout };
  }

  it('avisa dentro de 24 h, solo a pendientes, con el plazo como variante', async () => {
    const due = new Date(now.getTime() + 3 * 3600_000);
    const { notifier, recipients, fanout } = setup(due);
    await notifier.notify(uuid(1), now);
    expect(recipients.forAssignment).toHaveBeenCalledWith(expect.anything(), true);
    expect(fanout.notify).toHaveBeenCalledWith(
      'ASSIGNMENT_DUE_SOON',
      uuid(1),
      ['st-1'],
      String(Math.floor(due.getTime() / 1000)),
    );
  });

  it('no avisa si ya venció, si falta más de 24 h o si la tarea no corresponde', async () => {
    for (const d of [new Date(now.getTime() - 1), new Date(now.getTime() + 25 * 3600_000), null]) {
      const { notifier, fanout } = setup(d);
      expect((await notifier.notify(uuid(1), now)).created).toBe(0);
      expect(fanout.notify).not.toHaveBeenCalled();
    }
  });
});

describe('SendEmailProcessor', () => {
  function setup(opts: { failFor?: string[]; createdAt?: Date } = {}) {
    const rows = [
      { id: uuid(1), type: 'GRADE_PUBLISHED', recipientId: 'u1' },
      { id: uuid(2), type: 'GRADE_PUBLISHED', recipientId: 'u2' },
      { id: uuid(3), type: 'GRADE_PUBLISHED', recipientId: 'u3' },
    ];
    const prisma = {
      notification: {
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
        findMany: vi.fn(() => Promise.resolve(rows)),
      },
      user: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: 'u1',
              status: 'ACTIVE',
              contactEmail: 'u1@colegio.example',
              emailVerifiedAt: new Date(),
            },
            {
              id: 'u2',
              status: 'INACTIVE',
              contactEmail: 'u2@colegio.example',
              emailVerifiedAt: new Date(),
            },
            {
              id: 'u3',
              status: 'ACTIVE',
              contactEmail: 'u3@colegio.example',
              emailVerifiedAt: new Date(),
            },
          ]),
        ),
      },
    };
    const sendNotice = vi.fn((to: string) =>
      opts.failFor?.includes(to) ? Promise.reject(new Error('smtp')) : Promise.resolve(),
    );
    const processor = new SendEmailProcessor(
      new JobProcessorRegistry(),
      prisma as unknown as PrismaService,
      { sendNotice } as unknown as MailerService,
    );
    return { processor, prisma, sendNotice };
  }
  const ids = [uuid(1), uuid(2), uuid(3)];

  it('envía el correo mínimo solo a ACTIVE y marca SENT; los demás SKIPPED', async () => {
    const { processor, prisma, sendNotice } = setup();
    const res = await processor.handle(job({ notificationIds: ids }));
    expect(sendNotice.mock.calls).toEqual([
      ['u1@colegio.example', 'GRADE_PUBLISHED'],
      ['u3@colegio.example', 'GRADE_PUBLISHED'],
    ]);
    expect(res).toEqual({ sent: 2, skipped: 2, failed: 0 }); // 1 viejo (stale) + u2 INACTIVE
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: uuid(1), emailStatus: 'PENDING' },
      data: { emailStatus: 'SENT', emailSentAt: expect.any(Date) },
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: uuid(2), emailStatus: 'PENDING' },
      data: { emailStatus: 'SKIPPED' },
    });
  });

  it('pasa a SKIPPED los PENDING con más de 7 días antes de enviar', async () => {
    const { processor, prisma } = setup();
    await processor.handle(job({ notificationIds: ids }));
    const first = prisma.notification.updateMany.mock.calls[0] as unknown as [
      { where: { createdAt: { lt: Date } }; data: unknown },
    ];
    expect(first[0].data).toEqual({ emailStatus: 'SKIPPED' });
    const age = Date.now() - first[0].where.createdAt.lt.getTime();
    expect(Math.round(age / 86_400_000)).toBe(7);
  });

  it('si un envío falla reintenta (lanza) y en el último intento marca FAILED', async () => {
    const a = setup({ failFor: ['u3@colegio.example'] });
    await expect(a.processor.handle(job({ notificationIds: ids }, 0))).rejects.toThrow(
      'MAIL_FAILED',
    );
    expect(JSON.stringify(a.prisma.notification.updateMany.mock.calls)).not.toContain('FAILED');

    const b = setup({ failFor: ['u3@colegio.example'] });
    await expect(b.processor.handle(job({ notificationIds: ids }, 2))).rejects.toThrow(
      'MAIL_FAILED',
    );
    expect(b.prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, emailStatus: 'PENDING' },
      data: { emailStatus: 'FAILED' },
    });
  });

  it('datos inválidos o lote de más de 100 → no se reintenta', async () => {
    const { processor } = setup();
    await expect(processor.handle(job({ notificationIds: ['x'] }))).rejects.toThrow(
      UnrecoverableError,
    );
    const many = Array.from({ length: 101 }, (_, i) => uuid(i));
    await expect(processor.handle(job({ notificationIds: many }))).rejects.toThrow(
      UnrecoverableError,
    );
  });
});

describe('NotificationRetentionProcessor', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const DAY = 86_400_000;

  function setup(batches: number[]) {
    let call = 0;
    const prisma = {
      notification: {
        findMany: vi.fn(() => {
          const size = batches[call++] ?? 0;
          return Promise.resolve(Array.from({ length: size }, (_, i) => ({ id: `n${call}-${i}` })));
        }),
        deleteMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve({ count: where.id.in.length }),
        ),
        updateMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve({ count: where.id.in.length }),
        ),
      },
    };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const processor = new NotificationRetentionProcessor(
      new JobProcessorRegistry(),
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    return { processor, prisma, audit };
  }

  it('aplica los plazos 90/180/365/7 días, en lotes de 1000, con bitácora de solo conteos', async () => {
    // leídas: 1000 + 5; no leídas: 0; tope: 2; correos: 3
    const { processor, prisma, audit } = setup([1000, 5, 0, 2, 3]);
    const res = await processor.run(now);
    expect(res).toEqual({
      deletedRead: 1005,
      deletedUnread: 0,
      deletedExpired: 2,
      emailsSkipped: 3,
    });
    const wheres = prisma.notification.findMany.mock.calls.map(
      (c) => (c as unknown as [{ where: Record<string, unknown>; take: number }])[0],
    );
    expect(wheres.every((w) => w.take === 1000)).toBe(true);
    const lt = (w: { where: Record<string, unknown> }) =>
      (w.where.createdAt as { lt: Date }).lt.getTime();
    expect(wheres[0].where.readAt).toEqual({ not: null });
    expect(lt(wheres[0])).toBe(now.getTime() - 90 * DAY);
    expect(wheres[2].where.readAt).toBeNull();
    expect(lt(wheres[2])).toBe(now.getTime() - 180 * DAY);
    expect(lt(wheres[3])).toBe(now.getTime() - 365 * DAY);
    expect(wheres[4].where.emailStatus).toEqual({ in: ['PENDING', 'FAILED'] });
    expect(lt(wheres[4])).toBe(now.getTime() - 7 * DAY);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailStatus: 'SKIPPED', emailSentAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith({
      module: 'notifications',
      action: 'notification.retention',
      entityType: 'Notification',
      afterState: res,
    });
  });

  it('sin nada que hacer no deja bitácora', async () => {
    const { processor, audit } = setup([]);
    await processor.run(now);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('se registra como barrido diario de maintenance', () => {
    const registry = new JobProcessorRegistry();
    const p = new NotificationRetentionProcessor(registry, {} as PrismaService, {} as AuditService);
    p.onModuleInit();
    expect(registry.get('maintenance', 'notification-retention')).toBe(p);
    expect(p.everyMs).toBe(DAY);
  });
});
