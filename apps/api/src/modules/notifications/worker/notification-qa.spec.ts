import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import type { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { MailerService } from '../../jobs/mailer.service.js';
import { JobProcessorRegistry } from '../../jobs/processor.registry.js';
import type { QueueService } from '../../queue/index.js';
import {
  AnnouncementPublishedProcessor,
  AssignmentCreatedProcessor,
  AssignmentDueCheckProcessor,
  DueSoonNotifier,
  GradePublishedProcessor,
} from './event-notification.processors.js';
import { DueSoonSweepProcessor, NotificationRetentionProcessor } from './maintenance.processors.js';
import { NotificationFanout } from './notification-fanout.service.js';
import { NotificationRecipients } from './notification-recipients.service.js';
import { SendEmailProcessor } from './send-email.processor.js';

// QA de 5d: casos límite de fanout, dedupeKey, due-soon 24 h, retención 90/180/365/7 y lotes de 100.

const uuid = (n: number) => `0190a6f0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const job = (data: unknown, attemptsMade = 0) =>
  ({ data, attemptsMade, opts: { attempts: 3 } }) as unknown as Job;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const verified = { emailVerifiedAt: new Date('2026-01-01T00:00:00Z') };

type U = { id: string; contactEmail: string | null; emailVerifiedAt: Date | null };

/** Prisma falso con unicidad real de dedupeKey (como el índice único + skipDuplicates). */
function fanoutSetup(users: U[]) {
  const store = new Map<string, Record<string, unknown>>();
  const prisma = {
    user: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(users.filter((u) => where.id.in.includes(u.id))),
      ),
    },
    notification: {
      createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
        let count = 0;
        for (const d of data) {
          if (store.has(d.dedupeKey as string)) continue;
          store.set(d.dedupeKey as string, { ...d, id: `n-${d.recipientId as string}` });
          count++;
        }
        return Promise.resolve({ count });
      }),
      findMany: vi.fn(({ where }: { where: { dedupeKey: { in: string[] } } }) =>
        Promise.resolve(
          [...store.values()]
            .filter((r) => where.dedupeKey.in.includes(r.dedupeKey as string))
            .filter((r) => r.emailStatus === 'PENDING')
            .map((r) => ({ id: r.id })),
        ),
      ),
    },
  };
  const enqueue = vi.fn(() => Promise.resolve('j'));
  const fanout = new NotificationFanout(
    prisma as unknown as PrismaService,
    { enqueue } as unknown as QueueService,
  );
  return { fanout, prisma, enqueue, store };
}

const manyUsers = (n: number): U[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${String(i).padStart(4, '0')}`,
    contactEmail: `e${i}@colegio.example`,
    ...verified,
  }));

describe('NotificationFanout (RF-53)', () => {
  it('RF-53: sin correo verificado, sin correo o con correo inseguro → SKIPPED (deliverableEmail)', async () => {
    const { fanout, store } = fanoutSetup([
      { id: 'a', contactEmail: 'a@colegio.example', ...verified },
      { id: 'b', contactEmail: 'b@colegio.example', emailVerifiedAt: null },
      { id: 'c', contactEmail: null, ...verified },
      { id: 'd', contactEmail: 'd@x.example\r\nBcc: mal@x.example', ...verified },
    ]);
    const res = await fanout.notify('ANNOUNCEMENT_PUBLISHED', uuid(1), ['a', 'b', 'c', 'd']);
    expect(res).toEqual({ recipients: 4, created: 4, emailJobs: 1 });
    const status = (id: string) => store.get(`an:${uuid(1)}:${id}`)?.emailStatus;
    expect([status('a'), status('b'), status('c'), status('d')]).toEqual([
      'PENDING',
      'SKIPPED',
      'SKIPPED',
      'SKIPPED',
    ]);
  });

  it('RF-53: todos sin correo verificado → aviso en plataforma y ningún trabajo de correo', async () => {
    const { fanout, enqueue } = fanoutSetup([
      { id: 'b', contactEmail: 'b@x.example', emailVerifiedAt: null },
    ]);
    expect(await fanout.notify('GRADE_PUBLISHED', uuid(2), ['b'])).toEqual({
      recipients: 1,
      created: 1,
      emailJobs: 0,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('RF-53: lotes de correo: 100 → 1 trabajo; 101 → 2 (100 + 1); 200 → 2; 0 → ninguno', async () => {
    const sizesFor = async (n: number) => {
      const users = manyUsers(n);
      const s = fanoutSetup(users);
      await s.fanout.notify(
        'ANNOUNCEMENT_PUBLISHED',
        uuid(3),
        users.map((u) => u.id),
      );
      return s.enqueue.mock.calls.map(
        (c) => ((c as unknown[])[2] as { notificationIds: string[] }).notificationIds.length,
      );
    };
    expect(await sizesFor(100)).toEqual([100]);
    expect(await sizesFor(101)).toEqual([100, 1]);
    expect(await sizesFor(200)).toEqual([100, 100]);
    expect(await sizesFor(0)).toEqual([]);
  });

  it('RF-53: más de 500 destinatarios se insertan por tramos de 500 sin perder ninguno', async () => {
    const users = manyUsers(1001);
    const s = fanoutSetup(users);
    const res = await s.fanout.notify(
      'ANNOUNCEMENT_PUBLISHED',
      uuid(4),
      users.map((u) => u.id),
    );
    expect(res.created).toBe(1001);
    expect(s.prisma.notification.createMany).toHaveBeenCalledTimes(3);
    expect(res.emailJobs).toBe(11);
  });

  it('RF-53: dedupeKey: repetir el evento no duplica avisos y reutiliza los mismos jobId', async () => {
    const users = manyUsers(3);
    const s = fanoutSetup(users);
    const ids = users.map((u) => u.id);
    const first = await s.fanout.notify('ANNOUNCEMENT_PUBLISHED', uuid(5), ids);
    const again = await s.fanout.notify('ANNOUNCEMENT_PUBLISHED', uuid(5), [...ids, ...ids]);
    expect(first.created).toBe(3);
    expect(again.created).toBe(0);
    expect(s.store.size).toBe(3);
    const jobIds = s.enqueue.mock.calls.map((c) => (c as unknown[])[3]);
    expect(jobIds[0]).toEqual(jobIds[1]);
  });

  it('RF-53: dedupeKey distingue tipo, entidad y variante (plazo movido avisa otra vez)', async () => {
    const s = fanoutSetup(manyUsers(1));
    await s.fanout.notify('ASSIGNMENT_DUE_SOON', uuid(6), ['u0000'], '1000');
    await s.fanout.notify('ASSIGNMENT_DUE_SOON', uuid(6), ['u0000'], '1000');
    await s.fanout.notify('ASSIGNMENT_DUE_SOON', uuid(6), ['u0000'], '2000');
    await s.fanout.notify('ASSIGNMENT_CREATED', uuid(6), ['u0000']);
    expect([...s.store.keys()]).toEqual([
      `ds:${uuid(6)}:1000:u0000`,
      `ds:${uuid(6)}:2000:u0000`,
      `ac:${uuid(6)}:u0000`,
    ]);
  });

  it('RF-53: consulta solo usuarios ACTIVE (un INACTIVE no recibe aviso)', async () => {
    const s = fanoutSetup(manyUsers(1));
    await s.fanout.notify('GRADE_PUBLISHED', uuid(7), ['u0000']);
    expect(s.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['u0000'] }, status: 'ACTIVE' } }),
    );
  });
});

describe('DueSoonNotifier: límite de 24 h (RF-53)', () => {
  const now = new Date('2026-05-01T12:00:00Z');
  const run = async (offsetMs: number) => {
    const recipients = {
      assignment: vi.fn(() =>
        Promise.resolve({
          id: uuid(1),
          dueAt: new Date(now.getTime() + offsetMs),
          courseSection: { sectionId: 's' },
        }),
      ),
      forAssignment: vi.fn(() => Promise.resolve(['st'])),
    };
    const fanout = {
      notify: vi.fn(() => Promise.resolve({ recipients: 1, created: 1, emailJobs: 1 })),
    };
    await new DueSoonNotifier(
      recipients as unknown as NotificationRecipients,
      fanout as unknown as NotificationFanout,
    ).notify(uuid(1), now);
    return fanout.notify.mock.calls.length;
  };

  it('RF-53: exactamente 24 h → avisa; 24 h + 1 ms → no; 1 ms → avisa; 0 ms → no', async () => {
    expect(await run(DAY)).toBe(1);
    expect(await run(DAY + 1)).toBe(0);
    expect(await run(1)).toBe(1);
    expect(await run(0)).toBe(0);
  });
});

describe('DueSoonSweepProcessor (RF-53)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('RF-53: busca tareas con dueAt en (ahora, ahora+24 h], período abierto; corre cada hora', async () => {
    const findMany = vi.fn(() => Promise.resolve([{ id: uuid(1) }, { id: uuid(2) }]));
    const notify = vi
      .fn()
      .mockResolvedValueOnce({ recipients: 2, created: 2, emailJobs: 1 })
      .mockResolvedValueOnce({ recipients: 1, created: 0, emailJobs: 0 });
    const registry = new JobProcessorRegistry();
    const p = new DueSoonSweepProcessor(
      registry,
      { assignment: { findMany } } as unknown as PrismaService,
      { notify } as unknown as DueSoonNotifier,
    );
    p.onModuleInit();
    expect(registry.get('maintenance', 'due-soon')).toBe(p);
    expect(p.everyMs).toBe(HOUR);
    expect(await p.handle()).toEqual({ assignments: 2, created: 2 });
    const arg = (
      findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown>; take: number }]
    )[0];
    const now = Date.now();
    expect(arg.where.dueAt).toEqual({ gt: new Date(now), lte: new Date(now + DAY) });
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.period).toEqual({ closedAt: null });
    expect(arg.take).toBe(2000);
    expect(notify).toHaveBeenCalledWith(uuid(1), new Date(now));
  });

  it('sin tareas no avisa nada', async () => {
    const p = new DueSoonSweepProcessor(
      new JobProcessorRegistry(),
      { assignment: { findMany: vi.fn(() => Promise.resolve([])) } } as unknown as PrismaService,
      { notify: vi.fn() } as unknown as DueSoonNotifier,
    );
    expect(await p.handle()).toEqual({ assignments: 0, created: 0 });
  });
});

type Row = { id: string; createdAt: Date; readAt: Date | null; emailStatus: string };

describe('NotificationRetentionProcessor: límites exactos (RF-53)', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const at = (ms: number) => new Date(now.getTime() - ms);

  /** Base falsa que evalúa de verdad los filtros createdAt.lt, readAt y emailStatus. */
  function realistic(rows: Row[]) {
    type W = { readAt?: unknown; createdAt?: { lt: Date }; emailStatus?: { in: string[] } };
    const matches = (r: Row, w: W) => {
      if (w.readAt === null && r.readAt !== null) return false;
      if (w.readAt && typeof w.readAt === 'object' && r.readAt === null) return false;
      if (w.createdAt && !(r.createdAt.getTime() < w.createdAt.lt.getTime())) return false;
      if (w.emailStatus && !w.emailStatus.in.includes(r.emailStatus)) return false;
      return true;
    };
    const prisma = {
      notification: {
        findMany: vi.fn(({ where, take }: { where: W; take: number }) =>
          Promise.resolve(
            rows
              .filter((r) => matches(r, where))
              .slice(0, take)
              .map((r) => ({ id: r.id })),
          ),
        ),
        deleteMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) => {
          let count = 0;
          for (const id of where.id.in) {
            const i = rows.findIndex((r) => r.id === id);
            if (i >= 0) {
              rows.splice(i, 1);
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
        updateMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) => {
          let count = 0;
          for (const r of rows) {
            if (where.id.in.includes(r.id)) {
              r.emailStatus = 'SKIPPED';
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
      },
    };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const p = new NotificationRetentionProcessor(
      new JobProcessorRegistry(),
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
    return { p, rows, audit };
  }

  it('RF-53: leídas: exactamente 90 días se conserva; 90 días + 1 ms se borra', async () => {
    const { p, rows } = realistic([
      { id: 'r-exact', createdAt: at(90 * DAY), readAt: at(1), emailStatus: 'SENT' },
      { id: 'r-over', createdAt: at(90 * DAY + 1), readAt: at(1), emailStatus: 'SENT' },
    ]);
    const res = await p.run(now);
    expect(res.deletedRead).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['r-exact']);
  });

  it('RF-53: no leídas: 180 días se conserva; 180 días + 1 ms se borra', async () => {
    const { p, rows } = realistic([
      { id: 'u-exact', createdAt: at(180 * DAY), readAt: null, emailStatus: 'SENT' },
      { id: 'u-over', createdAt: at(180 * DAY + 1), readAt: null, emailStatus: 'SENT' },
      { id: 'u-89', createdAt: at(89 * DAY), readAt: null, emailStatus: 'SENT' },
    ]);
    const res = await p.run(now);
    expect(res).toMatchObject({ deletedRead: 0, deletedUnread: 1, deletedExpired: 0 });
    expect(rows.map((r) => r.id).sort()).toEqual(['u-89', 'u-exact']);
  });

  it('RF-53: tope de 365 días: borra lo leído antiguo; conserva lo leído de menos de 90 días', async () => {
    const { p, rows } = realistic([
      { id: 'old-read', createdAt: at(365 * DAY), readAt: at(364 * DAY), emailStatus: 'SENT' },
      { id: 'new-read', createdAt: at(89 * DAY), readAt: at(1), emailStatus: 'SENT' },
    ]);
    await p.run(now);
    expect(rows.map((r) => r.id)).toEqual(['new-read']);
  });

  it('RF-53: correos PENDING/FAILED: 7 días exactos se conservan; 7 días + 1 ms → SKIPPED; SENT no se toca', async () => {
    const { p, rows } = realistic([
      { id: 'e-exact', createdAt: at(7 * DAY), readAt: null, emailStatus: 'PENDING' },
      { id: 'e-over', createdAt: at(7 * DAY + 1), readAt: null, emailStatus: 'PENDING' },
      { id: 'e-failed', createdAt: at(8 * DAY), readAt: null, emailStatus: 'FAILED' },
      { id: 'e-sent', createdAt: at(8 * DAY), readAt: null, emailStatus: 'SENT' },
    ]);
    const res = await p.run(now);
    expect(res.emailsSkipped).toBe(2);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.emailStatus]))).toEqual({
      'e-exact': 'PENDING',
      'e-over': 'SKIPPED',
      'e-failed': 'SKIPPED',
      'e-sent': 'SENT',
    });
  });

  it('un fallo de la bitácora no rompe la retención', async () => {
    const { p, audit } = realistic([
      { id: 'x', createdAt: at(400 * DAY), readAt: null, emailStatus: 'SENT' },
    ]);
    audit.record.mockRejectedValueOnce(new Error('db'));
    await expect(p.run(now)).resolves.toMatchObject({ deletedUnread: 1 });
  });

  it('handle() usa la hora actual', async () => {
    const { p } = realistic([]);
    expect(await p.handle()).toEqual({
      deletedRead: 0,
      deletedUnread: 0,
      deletedExpired: 0,
      emailsSkipped: 0,
    });
  });
});

describe('SendEmailProcessor: 7 días, lote de 100 y correo no entregable (RF-53)', () => {
  function build(rows: { id: string; type: string; recipientId: string }[], users: unknown[]) {
    const prisma = {
      notification: {
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
        findMany: vi.fn(() => Promise.resolve(rows)),
      },
      user: { findMany: vi.fn(() => Promise.resolve(users)) },
    };
    const sendNotice = vi.fn(() => Promise.resolve());
    const p = new SendEmailProcessor(
      new JobProcessorRegistry(),
      prisma as unknown as PrismaService,
      { sendNotice } as unknown as MailerService,
    );
    return { p, prisma, sendNotice };
  }

  it('RF-53: el corte de 7 días es createdAt < ahora - 7 d (exacto)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
    try {
      const { p, prisma } = build([], []);
      await p.handle(job({ notificationIds: [uuid(1)] }));
      const first = (
        prisma.notification.updateMany.mock.calls[0] as unknown as [
          { where: { createdAt: { lt: Date } } },
        ]
      )[0];
      expect(first.where.createdAt.lt.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('RF-53: lote de exactamente 100 ids es válido; 101 o vacío no se reintenta', async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i + 1));
    const { p } = build([], []);
    await expect(p.handle(job({ notificationIds: ids(100) }))).resolves.toMatchObject({
      failed: 0,
    });
    await expect(p.handle(job({ notificationIds: ids(101) }))).rejects.toThrow(UnrecoverableError);
    await expect(p.handle(job({ notificationIds: [] }))).rejects.toThrow(UnrecoverableError);
  });

  it('RF-53: sin correo verificado, sin correo o con correo inseguro → SKIPPED, no se envía nada', async () => {
    const rows = [1, 2, 3].map((n) => ({
      id: uuid(n),
      type: 'GRADE_PUBLISHED',
      recipientId: `u${n}`,
    }));
    const users = [
      { id: 'u1', status: 'ACTIVE', contactEmail: 'u1@x.example', emailVerifiedAt: null },
      { id: 'u2', status: 'ACTIVE', contactEmail: null, emailVerifiedAt: new Date() },
      {
        id: 'u3',
        status: 'ACTIVE',
        contactEmail: 'a@x.example\nBcc: b@x.example',
        emailVerifiedAt: new Date(),
      },
    ];
    const { p, sendNotice } = build(rows, users);
    const res = await p.handle(job({ notificationIds: rows.map((r) => r.id) }));
    expect(sendNotice).not.toHaveBeenCalled();
    expect(res).toMatchObject({ sent: 0, failed: 0 });
  });

  it('tres fallos seguidos cortan el lote (SMTP caído)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: uuid(i + 1),
      type: 'GRADE_PUBLISHED',
      recipientId: `u${i}`,
    }));
    const users = rows.map((r) => ({
      id: r.recipientId,
      status: 'ACTIVE',
      contactEmail: `${r.recipientId}@x.example`,
      emailVerifiedAt: new Date(),
    }));
    const { p, sendNotice } = build(rows, users);
    sendNotice.mockRejectedValue(new Error('smtp'));
    await expect(p.handle(job({ notificationIds: rows.map((r) => r.id) }))).rejects.toThrow(
      'MAIL_FAILED',
    );
    expect(sendNotice).toHaveBeenCalledTimes(3);
  });
});

describe('Procesadores de eventos (RF-53)', () => {
  const fanout = () => ({
    notify: vi.fn(() => Promise.resolve({ recipients: 2, created: 2, emailJobs: 1 })),
  });
  const EMPTY = { recipients: 0, created: 0, emailJobs: 0 };

  it('assignment-created: avisa a la sección; tarea no vigente → vacío; dato inválido → sin reintento', async () => {
    const recipients = {
      assignment: vi
        .fn()
        .mockResolvedValueOnce({ id: uuid(1) })
        .mockResolvedValueOnce(null),
      forAssignment: vi.fn(() => Promise.resolve(['a', 'b'])),
    };
    const f = fanout();
    const registry = new JobProcessorRegistry();
    const p = new AssignmentCreatedProcessor(
      registry,
      recipients as unknown as NotificationRecipients,
      f as unknown as NotificationFanout,
    );
    p.onModuleInit();
    expect(registry.get('notifications', 'assignment-created')).toBe(p);
    await p.handle(job({ assignmentId: uuid(1) }));
    expect(f.notify).toHaveBeenCalledWith('ASSIGNMENT_CREATED', uuid(1), ['a', 'b']);
    expect(await p.handle(job({ assignmentId: uuid(1) }))).toEqual(EMPTY);
    await expect(p.handle(job({ assignmentId: 'x' }))).rejects.toThrow(UnrecoverableError);
  });

  it('assignment-due-check delega en DueSoonNotifier', async () => {
    const notify = vi.fn(() => Promise.resolve(EMPTY));
    const registry = new JobProcessorRegistry();
    const p = new AssignmentDueCheckProcessor(registry, { notify } as unknown as DueSoonNotifier);
    p.onModuleInit();
    expect(registry.get('notifications', 'assignment-due-check')).toBe(p);
    await p.handle(job({ assignmentId: uuid(1) }));
    expect(notify).toHaveBeenCalledWith(uuid(1), expect.any(Date));
    expect(() => p.handle(job({}))).toThrow(UnrecoverableError);
  });

  it('grade-published: nota válida avisa; nota sin matrícula vigente → vacío', async () => {
    const recipients = {
      forGrade: vi
        .fn()
        .mockResolvedValueOnce({ entityId: uuid(2), recipients: ['st', 'ap'] })
        .mockResolvedValueOnce(null),
    };
    const f = fanout();
    const registry = new JobProcessorRegistry();
    const p = new GradePublishedProcessor(
      registry,
      recipients as unknown as NotificationRecipients,
      f as unknown as NotificationFanout,
    );
    p.onModuleInit();
    expect(registry.get('notifications', 'grade-published')).toBe(p);
    await p.handle(job({ gradeId: uuid(2) }));
    expect(f.notify).toHaveBeenCalledWith('GRADE_PUBLISHED', uuid(2), ['st', 'ap']);
    expect((await p.handle(job({ gradeId: uuid(2) }))).created).toBe(0);
    expect(f.notify).toHaveBeenCalledTimes(1);
  });

  it('announcement-published: anuncio retirado o de año cerrado (null) no avisa', async () => {
    const recipients = {
      forAnnouncement: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(['x']),
    };
    const f = fanout();
    const registry = new JobProcessorRegistry();
    const p = new AnnouncementPublishedProcessor(
      registry,
      recipients as unknown as NotificationRecipients,
      f as unknown as NotificationFanout,
    );
    p.onModuleInit();
    expect(registry.get('notifications', 'announcement-published')).toBe(p);
    expect((await p.handle(job({ announcementId: uuid(3) }))).created).toBe(0);
    expect(f.notify).not.toHaveBeenCalled();
    await p.handle(job({ announcementId: uuid(3) }));
    expect(f.notify).toHaveBeenCalledWith('ANNOUNCEMENT_PUBLISHED', uuid(3), ['x']);
  });
});

describe('NotificationRecipients (RF-53)', () => {
  type Where = { where: Record<string, unknown> };
  function build() {
    const prisma = {
      assignment: { findFirst: vi.fn(() => Promise.resolve({ id: 'a' })) },
      grade: { findFirst: vi.fn() },
      announcement: { findFirst: vi.fn() },
      section: { findMany: vi.fn(() => Promise.resolve([{ id: 's1' }, { id: 's2' }])) },
      enrollment: {
        findMany: vi.fn(() =>
          Promise.resolve([{ studentId: 'st1' }, { studentId: 'st1' }, { studentId: 'st2' }]),
        ),
      },
      guardianStudent: {
        findMany: vi.fn(() => Promise.resolve([{ guardianId: 'g1' }, { guardianId: 'g1' }])),
      },
    };
    return { r: new NotificationRecipients(prisma as unknown as PrismaService), prisma };
  }

  it('assignment: solo tareas vigentes de un curso-sección activo en el año abierto', async () => {
    const { r, prisma } = build();
    await r.assignment('a');
    expect(prisma.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'a',
          deletedAt: null,
          courseSection: {
            isActive: true,
            section: { isActive: true, academicYear: { isActive: true, closedAt: null } },
          },
        },
      }),
    );
  });

  it('forAssignment(onlyPending): solo quienes no entregan; apoderados sin repetir', async () => {
    const { r, prisma } = build();
    const to = await r.forAssignment({ id: 'a', courseSection: { sectionId: 's1' } }, true);
    expect(to).toEqual(['st1', 'st2', 'g1']);
    const where = (prisma.enrollment.findMany.mock.calls[0] as unknown as [Where])[0].where;
    expect(where.submissions).toEqual({ none: { assignmentId: 'a' } });
    expect(where.student).toEqual({ status: 'ACTIVE' });
    expect(where.isCurrent).toBe(true);
    await r.forAssignment({ id: 'a', courseSection: { sectionId: 's1' } });
    const w2 = (prisma.enrollment.findMany.mock.calls[1] as unknown as [Where])[0].where;
    expect(w2).not.toHaveProperty('submissions');
  });

  it('withGuardians: solo vínculos vigentes de apoderados ACTIVE; sin estudiantes no consulta', async () => {
    const { r, prisma } = build();
    expect(await r.withGuardians([])).toEqual([]);
    expect(prisma.guardianStudent.findMany).not.toHaveBeenCalled();
    await r.withGuardians(['st1']);
    expect(prisma.guardianStudent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: { in: ['st1'] }, isActive: true, guardian: { status: 'ACTIVE' } },
      }),
    );
  });

  it('studentsOfSections sin secciones → vacío sin consultar', async () => {
    const { r, prisma } = build();
    expect(await r.studentsOfSections([])).toEqual([]);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('forGrade: solo nota MANUAL de matrícula vigente; sin nota → null', async () => {
    const { r, prisma } = build();
    prisma.grade.findFirst.mockResolvedValueOnce(null as never);
    expect(await r.forGrade('g')).toBeNull();
    prisma.grade.findFirst.mockResolvedValueOnce({
      id: 'g',
      enrollment: { studentId: 'st1' },
    } as never);
    expect(await r.forGrade('g')).toEqual({ entityId: 'g', recipients: ['st1', 'g1'] });
    expect(prisma.grade.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'MANUAL', assignment: { deletedAt: null } }),
      }),
    );
  });

  it('forAnnouncement: retirado o año cerrado → null; INSTITUTION = todas las secciones activas', async () => {
    const { r, prisma } = build();
    prisma.announcement.findFirst.mockResolvedValueOnce(null as never);
    expect(await r.forAnnouncement('x')).toBeNull();
    prisma.announcement.findFirst.mockResolvedValueOnce({
      academicYearId: 'y',
      scope: 'INSTITUTION',
      gradeLevel: null,
      courseSection: null,
    } as never);
    expect(await r.forAnnouncement('x')).toEqual(['st1', 'st2', 'g1']);
    expect(prisma.section.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academicYearId: 'y', isActive: true } }),
    );
  });

  it('forAnnouncement GRADE filtra por grado; COURSE_SECTION usa su sección y es vacío si está inactiva', async () => {
    const { r, prisma } = build();
    prisma.announcement.findFirst.mockResolvedValueOnce({
      academicYearId: 'y',
      scope: 'GRADE',
      gradeLevel: 3,
      courseSection: null,
    } as never);
    await r.forAnnouncement('x');
    expect(prisma.section.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { academicYearId: 'y', isActive: true, gradeLevel: 3 } }),
    );
    prisma.announcement.findFirst.mockResolvedValueOnce({
      academicYearId: 'y',
      scope: 'COURSE_SECTION',
      gradeLevel: null,
      courseSection: { sectionId: 's9', isActive: false },
    } as never);
    expect(await r.forAnnouncement('x')).toEqual([]);
    prisma.announcement.findFirst.mockResolvedValueOnce({
      academicYearId: 'y',
      scope: 'COURSE_SECTION',
      gradeLevel: null,
      courseSection: { sectionId: 's9', isActive: true },
    } as never);
    await r.forAnnouncement('x');
    const last = prisma.enrollment.findMany.mock.calls.at(-1) as unknown as [Where];
    expect(last[0].where.sectionId).toEqual({ in: ['s9'] });
  });
});
