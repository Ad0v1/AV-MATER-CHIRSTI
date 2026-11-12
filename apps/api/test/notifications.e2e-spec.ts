import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import type { Job } from 'bullmq';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { AuditService } from './../src/common/audit/audit.service.js';
import type { MailerService } from './../src/modules/jobs/mailer.service.js';
import type { JobProcessorRegistry } from './../src/modules/jobs/processor.registry.js';
import {
  AnnouncementPublishedProcessor,
  DueSoonNotifier,
} from './../src/modules/notifications/worker/event-notification.processors.js';
import {
  DueSoonSweepProcessor,
  NotificationRetentionProcessor,
} from './../src/modules/notifications/worker/maintenance.processors.js';
import { NotificationFanout } from './../src/modules/notifications/worker/notification-fanout.service.js';
import { NotificationRecipients } from './../src/modules/notifications/worker/notification-recipients.service.js';
import { SendEmailProcessor } from './../src/modules/notifications/worker/send-email.processor.js';
import { QueueService } from './../src/modules/queue/index.js';
import { createDbTestApp } from './helpers.js';

// Fase 5d de Dev 5 (RF-53): avisos con MySQL real y el seed (solo local). Los procesadores del
// worker se instancian a mano con el PrismaService de la app y QueueService espiado (sin Redis).
// apoderado01 tiene a estudiante01 (3.° A) y a estudiante11 (3.° B). Se borra al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const PREFIX = 'QA-5D-NT ';
const DAY = 24 * 3600 * 1000;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type View = { id: string; type: string; message: string; readAt: string | null; target: string };

const registry = { register: () => undefined } as unknown as JobProcessorRegistry;
const job = (data: Record<string, unknown>) =>
  ({ data, opts: { attempts: 3 }, attemptsMade: 0 }) as unknown as Job;

describe.skipIf(!process.env.DATABASE_URL)('Notificaciones 5d (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let enqueue: ReturnType<typeof vi.spyOn>;
  let recipients: NotificationRecipients;
  let fanout: NotificationFanout;
  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  const entityIds: string[] = [];
  let csId: string;
  let periodId: string;
  let announcementId: string;

  const http = () => request(app.getHttpServer());
  const as = (key: string | null, req: request.Test) =>
    key ? req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`) : req;
  const inbox = async (key: string, qs = '') => {
    const res = await as(key, http().get(`${API}/me/notifications${qs}`)).expect(200);
    return res.body as { items: View[]; unreadCount: number; total: number };
  };
  const ofAnnouncement = (recipientId: string) =>
    prisma.notification.findMany({ where: { entityId: announcementId, recipientId } });

  const clean = async () => {
    await prisma.notification.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await prisma.assignment.deleteMany({ where: { title: { startsWith: PREFIX } } });
  };

  beforeAll(async () => {
    app = await createDbTestApp();
    prisma = app.get(PrismaService);
    const queues = app.get(QueueService);
    enqueue = vi
      .spyOn(queues, 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));
    recipients = new NotificationRecipients(prisma);
    fanout = new NotificationFanout(prisma, queues);

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    csId = (
      await prisma.courseSection.findFirstOrThrow({
        where: {
          course: { name: 'Ciencia y Tecnología' },
          section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
        },
      })
    ).id;
    periodId = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, closedAt: null },
        orderBy: { sequence: 'desc' },
      })
    ).id;
    for (const key of ['docente03', 'estudiante01', 'estudiante11', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(
        key,
        await app.get(SessionService).create({ id: user.id, role: user.role as Role }),
      );
    }
    await prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await prisma.assignment.deleteMany({ where: { title: { startsWith: PREFIX } } });

    const created = await as(
      'docente03',
      http().post(`${API}/course-sections/${csId}/announcements`),
    )
      .send({ title: `${PREFIX}aviso`, body: 'Cuerpo privado' })
      .expect(201);
    announcementId = created.body.id as string;
    entityIds.push(announcementId);
  });

  afterAll(async () => {
    try {
      if (prisma) await clean();
    } finally {
      await app?.close();
    }
  });

  it('announcement-published: avisa al estudiante y a su apoderado vigente; no a otra sección', async () => {
    enqueue.mockClear();
    const proc = new AnnouncementPublishedProcessor(registry, recipients, fanout);
    const first = await proc.handle(job({ announcementId }));
    expect(first.created).toBeGreaterThan(0);
    expect(await ofAnnouncement(ids.get('estudiante01')!)).toHaveLength(1);
    expect(await ofAnnouncement(ids.get('apoderado01')!)).toHaveLength(1);
    expect(await ofAnnouncement(ids.get('estudiante11')!)).toHaveLength(0);
    expect(await ofAnnouncement(ids.get('docente03')!)).toHaveLength(0);
    // Los correos solo salen para los PENDING (correo verificado) y en lotes con solo ids.
    const pending = await prisma.notification.count({
      where: { entityId: announcementId, emailStatus: 'PENDING' },
    });
    const calls = (enqueue.mock.calls as unknown[][]).filter((c) => c[1] === 'send-email');
    const queued = calls.flatMap((c) => (c[2] as { notificationIds: string[] }).notificationIds);
    expect(queued).toHaveLength(pending);
    for (const c of calls) expect(Object.keys(c[2] as object)).toEqual(['notificationIds']);

    // Idempotente: repetir no duplica.
    const again = await proc.handle(job({ announcementId }));
    expect(again.created).toBe(0);
    expect(await ofAnnouncement(ids.get('estudiante01')!)).toHaveLength(1);
  });

  it('send-email: usa solo el correo entregable y marca SENT o SKIPPED', async () => {
    const rows = await prisma.notification.findMany({
      where: { entityId: announcementId },
      select: { id: true },
    });
    const sendNotice = vi.fn().mockResolvedValue(undefined);
    const proc = new SendEmailProcessor(registry, prisma, {
      sendNotice,
    } as unknown as MailerService);
    const res = await proc.handle(job({ notificationIds: rows.slice(0, 100).map((r) => r.id) }));
    expect(res.failed).toBe(0);
    for (const [to, kind] of sendNotice.mock.calls) {
      expect(to).toMatch(/@/);
      expect(kind).toBe('ANNOUNCEMENT_PUBLISHED');
    }
    const stillPending = await prisma.notification.count({
      where: { id: { in: rows.slice(0, 100).map((r) => r.id) }, emailStatus: 'PENDING' },
    });
    expect(stillPending).toBe(0);
  });

  it('GET /me/notifications: solo las propias, con mensaje y contador; sin el cuerpo', async () => {
    const box = await inbox('estudiante01', '?unread=true');
    const mine = box.items.find((i) => i.message.includes(`${PREFIX}aviso`))!;
    expect(mine).toMatchObject({ type: 'ANNOUNCEMENT_PUBLISHED', target: 'ANNOUNCEMENT' });
    expect(box.unreadCount).toBeGreaterThan(0);
    expect(JSON.stringify(box)).not.toContain('Cuerpo privado');
    await http().get(`${API}/me/notifications`).expect(401);
  });

  it('marcar leída: propia 204 e idempotente; ajena 404; read-all deja el contador en 0', async () => {
    const [own] = await ofAnnouncement(ids.get('estudiante01')!);
    const [ward] = await ofAnnouncement(ids.get('apoderado01')!);
    await as('estudiante01', http().post(`${API}/me/notifications/${own!.id}/read`)).expect(204);
    await as('estudiante01', http().post(`${API}/me/notifications/${own!.id}/read`)).expect(204);
    await as('estudiante01', http().post(`${API}/me/notifications/${ward!.id}/read`)).expect(404);
    await as('estudiante01', http().post(`${API}/me/notifications/no-uuid/read`)).expect(400);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: ward!.id } });
    expect(after.readAt).toBeNull();
    const res = await as('apoderado01', http().post(`${API}/me/notifications/read-all`)).expect(
      200,
    );
    expect(res.body.updated).toBeGreaterThan(0);
    expect((await inbox('apoderado01')).unreadCount).toBe(0);
  });

  it('anuncio retirado: el aviso queda sin enlace ni título', async () => {
    await as('docente03', http().delete(`${API}/announcements/${announcementId}`)).expect(204);
    const box = await inbox('estudiante01');
    const item = box.items.find((i) => i.type === 'ANNOUNCEMENT_PUBLISHED' && i.target === null);
    expect(item?.message).toBe('Un anuncio fue retirado.');
    expect(JSON.stringify(box)).not.toContain(`${PREFIX}aviso`);
    // Un anuncio retirado ya no genera avisos.
    const proc = new AnnouncementPublishedProcessor(registry, recipients, fanout);
    expect((await proc.handle(job({ announcementId }))).recipients).toBe(0);
  });

  it('maintenance:due-soon avisa una vez por plazo a quien no entregó', async () => {
    const a = await prisma.assignment.create({
      data: {
        courseSectionId: csId,
        periodId,
        title: `${PREFIX}vence`,
        instructions: 'x',
        dueAt: new Date(Date.now() + 2 * 3600 * 1000),
        createdById: ids.get('docente03')!,
      },
    });
    entityIds.push(a.id);
    const sweep = new DueSoonSweepProcessor(
      registry,
      prisma,
      new DueSoonNotifier(recipients, fanout),
    );
    // Solo se afirma sobre la tarea propia (el barrido recorre toda la base local).
    const countFor = (key: string) =>
      prisma.notification.count({
        where: { entityId: a.id, type: 'ASSIGNMENT_DUE_SOON', recipientId: ids.get(key) },
      });
    await sweep.handle();
    expect(await countFor('estudiante01')).toBe(1);
    expect(await countFor('apoderado01')).toBe(1);
    expect(await countFor('estudiante11')).toBe(0);
    await sweep.handle();
    expect(await countFor('estudiante01')).toBe(1);
    expect(await countFor('apoderado01')).toBe(1);
  });

  it('maintenance:notification-retention: 90 días leídas, 180 no leídas, tope 365, correos 7 días', async () => {
    const entityId = randomUUID();
    entityIds.push(entityId);
    const me = ids.get('estudiante11')!;
    const now = new Date();
    const at = (days: number) => new Date(now.getTime() - days * DAY);
    const mk = (key: string, createdAt: Date, readAt: Date | null, emailStatus = 'SKIPPED') =>
      prisma.notification.create({
        data: {
          recipientId: me,
          type: 'ANNOUNCEMENT_PUBLISHED',
          entityId,
          dedupeKey: `qa5d:${entityId}:${key}`,
          createdAt,
          readAt,
          emailStatus: emailStatus as 'SKIPPED' | 'PENDING',
        },
      });
    const readOld = await mk('r91', at(91), at(90));
    const readKeep = await mk('r89', at(89), at(88));
    const unreadOld = await mk('u181', at(181), null);
    const unreadKeep = await mk('u179', at(179), null, 'PENDING');
    const fresh = await mk('f1', at(1), null, 'PENDING');

    const proc = new NotificationRetentionProcessor(registry, prisma, app.get(AuditService));
    const res = await proc.run(now);
    expect(res.deletedRead).toBeGreaterThanOrEqual(1);
    expect(res.deletedUnread).toBeGreaterThanOrEqual(1);
    const left = await prisma.notification.findMany({ where: { entityId } });
    const byId = new Map(left.map((r) => [r.id, r]));
    expect(byId.has(readOld.id)).toBe(false);
    expect(byId.has(unreadOld.id)).toBe(false);
    expect(byId.has(readKeep.id)).toBe(true);
    expect(byId.get(unreadKeep.id)?.emailStatus).toBe('SKIPPED');
    expect(byId.get(fresh.id)?.emailStatus).toBe('PENDING');
  });
});
