import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { createDbTestApp } from './helpers.js';

// Fase 5g de Dev 5 (RF-62; RF-55/56 con U9): GET /admin/audit-logs contra MySQL real (solo local
// con Docker). AuditLog es solo inserción (la BD rechaza UPDATE y DELETE): las filas de prueba
// llevan una acción única `qa5g.<aleatorio>` y quedan en la BD local de desarrollo.
// RF-64 (período cerrado = entrega de solo lectura) va al final, con datos de la semilla.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE_PREFIX = 'QA-5G ';
type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Item = {
  id: string;
  action: string;
  module: string;
  actor: { id: string; fullName: string; role: Role } | null;
  supportMode: boolean;
  afterState: unknown;
};

describe.skipIf(!process.env.DATABASE_URL)('Bitácora del ADMIN 5g (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  const action = `qa5g.t${randomBytes(6).toString('hex')}`;
  const base = new Date(Date.now() - 3 * 86_400_000);

  const http = () => request(app.getHttpServer());
  const get = (key: string | null, url: string) => {
    const req = http().get(API + url);
    return key ? req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`) : req;
  };
  const list = (query: string, key = 'admin') => get(key, `/admin/audit-logs?${query}`);

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
    // Tres filas: ADMIN en notas (modo soporte), docente en notas y el sistema en lifecycle.
    await prisma.auditLog.createMany({
      data: [
        {
          actorId: ids.get('admin'),
          action,
          module: 'grading',
          entityType: 'Grade',
          entityId: randomUUID(),
          ip: '203.0.113.7',
          afterState: { state: 'GRADED' },
          occurredAt: new Date(base.getTime() + 1000),
        },
        {
          actorId: ids.get('docente01'),
          action,
          module: 'grading',
          occurredAt: new Date(base.getTime() + 2000),
        },
        { actorId: null, action, module: 'lifecycle', occurredAt: base },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('401 sin sesión y 403 para otros roles', async () => {
    await get(null, '/admin/audit-logs').expect(401);
    await list('', 'docente01').expect(403);
    await list('', 'estudiante01').expect(403);
  });

  it('filtra por acción, ordena del más reciente y marca el modo soporte (U9)', async () => {
    const res = await list(`action=${action}`).expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    const items = res.body.items as Item[];
    expect(items.map((i) => i.actor?.id ?? null)).toEqual([
      ids.get('docente01'),
      ids.get('admin'),
      null,
    ]);
    expect(items.map((i) => i.supportMode)).toEqual([false, true, false]);
    expect(items[1]).toMatchObject({
      module: 'grading',
      entityType: 'Grade',
      actor: { role: 'ADMIN' },
      afterState: { state: 'GRADED' },
    });
    // La IP es un dato personal: no sale en la vista.
    for (const i of items) expect(i).not.toHaveProperty('ip');
  });

  it('combina actor, módulo y rango de fechas', async () => {
    const byActor = await list(`action=${action}&actorId=${ids.get('admin')}`).expect(200);
    expect(byActor.body.total).toBe(1);

    const byModule = await list(`action=${action}&module=lifecycle`).expect(200);
    expect(byModule.body.items).toEqual([expect.objectContaining({ actor: null })]);

    const from = encodeURIComponent(new Date(base.getTime() + 500).toISOString());
    const to = encodeURIComponent(new Date(base.getTime() + 1500).toISOString());
    const byRange = await list(`action=${action}&from=${from}&to=${to}`).expect(200);
    expect(byRange.body.total).toBe(1);
    expect(byRange.body.items[0].actor.id).toBe(ids.get('admin'));

    const empty = await list(`action=${action}&page=2`).expect(200);
    expect(empty.body).toMatchObject({ page: 2, total: 3, items: [] });
  });

  it('400 con filtros inválidos (sin comodines ni parámetros extra)', async () => {
    await list('action=job%25').expect(400);
    await list('module=Grading').expect(400);
    await list('actorId=123').expect(400);
    await list('page=0').expect(400);
    await list('page=201').expect(400);
    await list('ip=1.1.1.1').expect(400);
    await list('from=2026-01-01').expect(400);
    await list('from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z').expect(400);
    await list('from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z').expect(400);
  });

  it('solo lectura: no hay POST, PUT ni DELETE', async () => {
    const cookie = `${SESSION_COOKIE}=${cookies.get('admin')}`;
    for (const method of ['post', 'put', 'delete'] as const) {
      const res = await http()[method](`${API}/admin/audit-logs`).set('Cookie', cookie).send({});
      expect([403, 404, 405]).toContain(res.status);
    }
  });

  // RF-64: al cerrar el período las entregas quedan de solo lectura (D-030): no se acepta una
  // versión nueva, pero el estudiante y el docente siguen viendo lo entregado.
  describe('RF-64: período cerrado', () => {
    let periodId: string;
    let assignmentId: string;
    let fileId: string;

    beforeAll(async () => {
      const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
      const cs = await prisma.courseSection.findFirstOrThrow({
        where: {
          teacherId: ids.get('docente01'),
          section: {
            academicYearId: y2026.id,
            enrollments: { some: { studentId: ids.get('estudiante01'), isCurrent: true } },
          },
        },
      });
      const period = await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, closedAt: null },
        orderBy: { sequence: 'desc' },
      });
      periodId = period.id;
      assignmentId = (
        await prisma.assignment.create({
          data: {
            courseSectionId: cs.id,
            periodId,
            title: `${TITLE_PREFIX}Tarea período cerrado`,
            instructions: 'Subir en PDF',
            dueAt: new Date(Date.now() + 86_400_000),
            allowLate: true,
            createdById: ids.get('docente01')!,
          },
        })
      ).id;
      fileId = (
        await prisma.storedFile.create({
          data: {
            objectKey: `submissions/2026/11/${randomUUID()}.pdf`,
            purpose: 'SUBMISSION',
            courseSectionId: cs.id,
            assignmentId,
            uploadedById: ids.get('estudiante01')!,
            originalName: 'entrega.pdf',
            maxBytes: 1024,
            sizeBytes: 100,
            sha256: randomBytes(32).toString('hex'),
            uploadStatus: 'COMPLETED',
            scanStatus: 'CLEAN',
            intentExpiresAt: new Date(Date.now() + 300_000),
            completedAt: new Date(),
            scannedAt: new Date(),
          },
        })
      ).id;
      await prisma.academicPeriod.update({
        where: { id: periodId },
        data: { closedAt: new Date() },
      });
    });

    afterAll(async () => {
      if (periodId) {
        await prisma.academicPeriod.update({ where: { id: periodId }, data: { closedAt: null } });
      }
      if (fileId) await prisma.storedFile.deleteMany({ where: { id: fileId } });
      if (assignmentId) await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    });

    it('la entrega se rechaza con 409 y no crea versión; la lectura sigue disponible', async () => {
      const res = await http()
        .post(`${API}/assignments/${assignmentId}/submissions`)
        .set('Cookie', `${SESSION_COOKIE}=${cookies.get('estudiante01')}`)
        .send({ fileId });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('El período está cerrado');
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);

      const mine = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`);
      expect(mine.status).toBe(200);
      expect(mine.body).toMatchObject({ assignment: { id: assignmentId }, versions: [] });
      await get('docente01', `/assignments/${assignmentId}/submissions`).expect(200);
    });
  });
});
