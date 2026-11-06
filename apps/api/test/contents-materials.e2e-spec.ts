import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  ContentsEventPublisher,
  type ContentsEvent,
} from './../src/modules/contents/contents-events.js';
import { READING_COPYRIGHT_NOTICE } from './../src/modules/contents/materials.policy.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 3e de Dev 3 (RF-26/27/29/30/31, RN-10, RN-12). MySQL real con el seed (solo local).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE_PREFIX = 'QA-3E ';
const KEY_PREFIX = 'qa-3e/';
const DAY = 86_400_000;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Materiales de Dev 3, fase 3e (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let sink: MemoryAuditSink;
  let events: ContentsEvent[];
  let unsubscribe: () => void = () => undefined;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();

  let cs3AMath: string;
  let cs3BMath: string;
  let period1Of2026: string; // cerrado en el seed
  let period3Of2026: string;
  let period4Of2026: string;

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const post = (key: string, url: string, body?: object) =>
    http()
      .post(API + url)
      .set('Cookie', as(key))
      .send(body);
  const patch = (key: string, url: string, body: object) =>
    http()
      .patch(API + url)
      .set('Cookie', as(key))
      .send(body);
  const del = (key: string, url: string) =>
    http()
      .delete(API + url)
      .set('Cookie', as(key));

  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);
  const listIds = (res: { body: Json }) => res.body.items.map((m: Json) => m.id as string);

  /** StoredFile de prueba directo en la BD (la subida real es de la fase 3b). */
  const makeFile = async (
    courseSectionId: string,
    opts: { purpose?: 'MATERIAL' | 'ASSIGNMENT_ATTACHMENT'; clean?: boolean } = {},
  ) => {
    const clean = opts.clean ?? true;
    const file = await prisma.storedFile.create({
      data: {
        objectKey: `${KEY_PREFIX}${randomUUID()}`,
        purpose: opts.purpose ?? 'MATERIAL',
        courseSectionId,
        uploadedById: ids.get('docente01')!,
        originalName: 'qa.pdf',
        maxBytes: 20971520,
        intentExpiresAt: new Date(Date.now() + 300_000),
        ...(clean
          ? {
              uploadStatus: 'COMPLETED',
              scanStatus: 'CLEAN',
              sizeBytes: 2048,
              sha256: createHash('sha256').update(randomUUID()).digest('hex'),
              completedAt: new Date(),
              scannedAt: new Date(),
            }
          : {}),
      },
    });
    return file.id;
  };

  // Crea el archivo y publica; se usa como publish(...).expect(status), igual que supertest.
  const publish = (key: string, cs: string, extra: object = {}) => ({
    expect: async (status: number) =>
      post(key, `/course-sections/${cs}/materials`, {
        kind: 'CLASS',
        title: `${TITLE_PREFIX}Clase`,
        fileId: await makeFile(cs),
        ...extra,
      }).expect(status),
  });

  const cleanQaData = async () => {
    await prisma.material.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });
    await prisma.storedFile.deleteMany({ where: { objectKey: { startsWith: KEY_PREFIX } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await cleanQaData();

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const periodOf = async (sequence: number) =>
      (
        await prisma.academicPeriod.findFirstOrThrow({
          where: { academicYearId: y2026.id, sequence },
        })
      ).id;
    period1Of2026 = await periodOf(1);
    period3Of2026 = await periodOf(3);
    period4Of2026 = await periodOf(4);
    const csOf = async (code: string) =>
      (
        await prisma.courseSection.findFirstOrThrow({
          where: {
            course: { name: 'Matemática' },
            section: { academicYearId: y2026.id, gradeLevel: 3, code },
          },
        })
      ).id;
    cs3AMath = await csOf('A');
    cs3BMath = await csOf('B');

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    events = [];
    unsubscribe = app
      .get(ContentsEventPublisher)
      .on('material.published.v1', (e) => void events.push(e as ContentsEvent));

    const sessions = app.get(SessionService);
    for (const key of [
      'admin',
      'docente01',
      'docente02',
      'estudiante01',
      'estudiante11',
      'apoderado01',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      unsubscribe();
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: null },
      });
      await cleanQaData();
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
    events.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Autenticación y roles', () => {
    it('401 sin sesión en las 5 rutas', async () => {
      const id = randomUUID();
      await http().get(`${API}/course-sections/${id}/materials`).expect(401);
      await http().post(`${API}/course-sections/${id}/materials`).send({}).expect(401);
      await http().patch(`${API}/materials/${id}`).send({}).expect(401);
      await http().delete(`${API}/materials/${id}`).expect(401);
      await http().post(`${API}/materials/${id}/restore`).expect(401);
    });

    it('el apoderado no ve materiales (403), aunque su hijo esté en el curso', async () => {
      await get('apoderado01', `/course-sections/${cs3AMath}/materials`).expect(403);
    });

    it('400 con id no UUID; 404 con curso-sección o material inexistentes', async () => {
      await get('docente01', '/course-sections/no-es-uuid/materials').expect(400);
      await get('admin', `/course-sections/${randomUUID()}/materials`).expect(404);
      await patch('admin', `/materials/${randomUUID()}`, { title: 'x' }).expect(404);
      await del('admin', `/materials/${randomUUID()}`).expect(404);
      await post('admin', `/materials/${randomUUID()}/restore`).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Publicar (RF-26/27, RN-10)', () => {
    it('QA-001: el docente de 3A publica un PDF; 3A lo ve y el alumno de 3B recibe 403', async () => {
      const res = await publish('docente01', cs3AMath, { periodId: period4Of2026 }).expect(201);
      expect(res.body).toMatchObject({
        courseSectionId: cs3AMath,
        periodId: period4Of2026,
        kind: 'CLASS',
        isReusable: false,
        copyrightNotice: null,
        deletedAt: null,
        restorableUntil: null,
      });
      expect(typeof res.body.fileId).toBe('string');

      for (const key of ['docente01', 'estudiante01', 'admin']) {
        const list = await get(key, `/course-sections/${cs3AMath}/materials`).expect(200);
        expect(listIds(list), key).toContain(res.body.id);
      }
      await get('estudiante11', `/course-sections/${cs3AMath}/materials`).expect(403);
      await get('docente02', `/course-sections/${cs3AMath}/materials`).expect(403);
      const in3B = await get('estudiante11', `/course-sections/${cs3BMath}/materials`).expect(200);
      expect(listIds(in3B)).not.toContain(res.body.id);

      // Bitácora y evento sin título ni nombre de archivo.
      const [audit] = auditOf('contents.material.created');
      expect(audit).toMatchObject({
        module: 'contents',
        entityType: 'Material',
        entityId: res.body.id,
        actorId: ids.get('docente01'),
      });
      expect(JSON.stringify(audit)).not.toContain(TITLE_PREFIX);
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({
        materialId: res.body.id,
        courseSectionId: cs3AMath,
        periodId: period4Of2026,
        kind: 'CLASS',
        publishedAt: res.body.createdAt,
      });
    });

    it('QA-002: una lectura lleva el aviso de copyright y guarda isReusable', async () => {
      const res = await publish('docente01', cs3AMath, {
        kind: 'READING',
        title: `${TITLE_PREFIX}Lectura`,
        description: 'Capítulo 3',
        isReusable: true,
      }).expect(201);
      expect(res.body).toMatchObject({
        kind: 'READING',
        periodId: null,
        isReusable: true,
        description: 'Capítulo 3',
        copyrightNotice: READING_COPYRIGHT_NOTICE,
      });
      const row = await prisma.material.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.isReusable).toBe(true);

      const list = await get(
        'estudiante01',
        `/course-sections/${cs3AMath}/materials?kind=READING`,
      ).expect(200);
      const seen = list.body.items.find((m: Json) => m.id === res.body.id);
      expect(seen.copyrightNotice).toBe(READING_COPYRIGHT_NOTICE);
      expect(list.body.items.every((m: Json) => m.kind === 'READING')).toBe(true);
    });

    it('400: clase reutilizable, campos de más o tipo desconocido', async () => {
      await publish('docente01', cs3AMath, { isReusable: true }).expect(400);
      await publish('docente01', cs3AMath, { deletedAt: null }).expect(400);
      await publish('docente01', cs3AMath, { kind: 'VIDEO' }).expect(400);
    });

    it('RN-10: período cerrado → 409 y nada se crea', async () => {
      const before = await prisma.material.count();
      await publish('docente01', cs3AMath, { periodId: period1Of2026 }).expect(409);
      expect(await prisma.material.count()).toBe(before);
      expect(events).toHaveLength(0);
    });

    it('RN-12: docente ajeno y estudiante → 403; ADMIN publica (modo soporte)', async () => {
      await publish('docente02', cs3AMath).expect(403);
      await publish('estudiante01', cs3AMath).expect(403);
      await publish('apoderado01', cs3AMath).expect(403);
      await publish('admin', cs3AMath).expect(201);
      expect(auditOf('contents.material.created')[0].actorId).toBe(ids.get('admin'));
    });

    it('archivo: 422 si es de otra sección, no está limpio o es de otro propósito; 409 si ya se publicó', async () => {
      for (const fileId of [
        await makeFile(cs3BMath),
        await makeFile(cs3AMath, { clean: false }),
        await makeFile(cs3AMath, { purpose: 'ASSIGNMENT_ATTACHMENT' }),
        randomUUID(),
      ]) {
        await publish('docente01', cs3AMath, { fileId }).expect(422);
      }
      const fileId = await makeFile(cs3AMath);
      await publish('docente01', cs3AMath, { fileId }).expect(201);
      await publish('docente01', cs3AMath, { fileId }).expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Huecos de QA (período de otro año, privacidad)', () => {
    it('D-010/RN-10: un periodId de otro año o inexistente no publica (4xx) y no crea nada', async () => {
      const y2025 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } });
      const period2025 = (
        await prisma.academicPeriod.findFirstOrThrow({
          where: { academicYearId: y2025.id, sequence: 1 },
        })
      ).id;
      const before = await prisma.material.count();
      const res = await publish('docente01', cs3AMath, { periodId: period2025 }).expect(422);
      expect(res.body.error).toBeDefined();
      await publish('docente01', cs3AMath, { periodId: randomUUID() }).expect(404);
      expect(await prisma.material.count()).toBe(before);
      expect(events).toHaveLength(0);
      expect(auditOf('contents.material.created')).toHaveLength(0);
    });

    it('privacidad: bitácora y evento de publicar/editar/borrar/restaurar sin títulos, descripciones ni nombres', async () => {
      const { body: created } = await publish('docente01', cs3AMath, {
        kind: 'READING',
        title: `${TITLE_PREFIX}Secreto-Quispe`,
        description: 'Descripcion-confidencial',
      }).expect(201);
      await patch('docente01', `/materials/${created.id}`, {
        title: `${TITLE_PREFIX}Secreto-v2`,
        description: 'Otra-descripcion',
      }).expect(200);
      await del('docente01', `/materials/${created.id}`).expect(204);
      await post('docente01', `/materials/${created.id}/restore`).expect(200);
      const dump = JSON.stringify([...sink.records, ...events]);
      for (const leak of [
        'Secreto',
        'Quispe',
        'confidencial',
        'Otra-descripcion',
        'qa.pdf',
        '@colegio.example',
        'Docente',
      ]) {
        expect(dump, leak).not.toContain(leak);
      }
      expect(events).toHaveLength(1);
      for (const action of ['created', 'updated', 'deleted', 'restored']) {
        expect(auditOf(`contents.material.${action}`), action).toHaveLength(1);
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('Editar (RF-29)', () => {
    it('el docente edita; la bitácora no guarda textos; 400 si cambia kind o fileId', async () => {
      const { body: created } = await publish('docente01', cs3AMath, {
        kind: 'READING',
      }).expect(201);
      sink.records.length = 0;
      const res = await patch('docente01', `/materials/${created.id}`, {
        title: `${TITLE_PREFIX}Editado`,
        isReusable: true,
      }).expect(200);
      expect(res.body).toMatchObject({ title: `${TITLE_PREFIX}Editado`, isReusable: true });
      const [audit] = auditOf('contents.material.updated');
      expect(audit.afterState).toEqual({
        isReusable: true,
        changedFields: ['title', 'isReusable'],
      });
      expect(JSON.stringify(audit)).not.toContain('Editado');

      await patch('docente01', `/materials/${created.id}`, { kind: 'CLASS' }).expect(400);
      await patch('docente01', `/materials/${created.id}`, { fileId: randomUUID() }).expect(400);
      await patch('docente02', `/materials/${created.id}`, { title: 'x' }).expect(403);
      await patch('estudiante01', `/materials/${created.id}`, { title: 'x' }).expect(403);
    });

    it('422: una clase no se marca reutilizable', async () => {
      const { body: created } = await publish('docente01', cs3AMath).expect(201);
      await patch('docente01', `/materials/${created.id}`, { isReusable: true }).expect(422);
    });

    it('RN-10: con el período cerrado no se edita, borra ni restaura (409)', async () => {
      const { body: created } = await publish('docente01', cs3AMath, {
        periodId: period3Of2026,
      }).expect(201);
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: new Date() },
      });
      try {
        await patch('docente01', `/materials/${created.id}`, { title: 'x' }).expect(409);
        await del('docente01', `/materials/${created.id}`).expect(409);
        // Sigue visible para los miembros.
        const list = await get('estudiante01', `/course-sections/${cs3AMath}/materials`).expect(
          200,
        );
        expect(listIds(list)).toContain(created.id);
      } finally {
        await prisma.academicPeriod.update({
          where: { id: period3Of2026 },
          data: { closedAt: null },
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('Papelera (RF-30)', () => {
    it('QA-015: borrar y restaurar dentro de los 30 días', async () => {
      const { body: created } = await publish('docente01', cs3AMath).expect(201);
      sink.records.length = 0;
      await del('estudiante01', `/materials/${created.id}`).expect(403);
      await del('docente02', `/materials/${created.id}`).expect(403);
      await del('docente01', `/materials/${created.id}`).expect(204);

      const row = await prisma.material.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.deletedById).toBe(ids.get('docente01'));
      expect(auditOf('contents.material.deleted')).toHaveLength(1);

      // Fuera de la lista normal; en la papelera solo para docente o ADMIN.
      const normal = await get('estudiante01', `/course-sections/${cs3AMath}/materials`).expect(
        200,
      );
      expect(listIds(normal)).not.toContain(created.id);
      await get(
        'estudiante01',
        `/course-sections/${cs3AMath}/materials?includeDeleted=true`,
      ).expect(403);
      await get('docente02', `/course-sections/${cs3AMath}/materials?includeDeleted=true`).expect(
        403,
      );
      for (const key of ['docente01', 'admin']) {
        const trash = await get(
          key,
          `/course-sections/${cs3AMath}/materials?includeDeleted=true`,
        ).expect(200);
        const item = trash.body.items.find((m: Json) => m.id === created.id);
        expect(item.deletedAt, key).not.toBeNull();
        expect(new Date(item.restorableUntil).getTime() - new Date(item.deletedAt).getTime()).toBe(
          30 * DAY,
        );
      }

      // Borrado: no se edita ni se borra otra vez (404).
      await patch('docente01', `/materials/${created.id}`, { title: 'x' }).expect(404);
      await del('docente01', `/materials/${created.id}`).expect(404);

      await post('estudiante01', `/materials/${created.id}/restore`).expect(403);
      const restored = await post('docente01', `/materials/${created.id}/restore`).expect(200);
      expect(restored.body).toMatchObject({ id: created.id, deletedAt: null });
      const after = await prisma.material.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.deletedAt).toBeNull();
      expect(after.deletedById).toBeNull();
      expect(auditOf('contents.material.restored')).toHaveLength(1);
      const list = await get('estudiante01', `/course-sections/${cs3AMath}/materials`).expect(200);
      expect(listIds(list)).toContain(created.id);

      // Restaurar algo que no está en la papelera → 409.
      await post('docente01', `/materials/${created.id}/restore`).expect(409);
    });

    it('QA-015: el día 30 aún se restaura (30 días menos 10 min → 200) y pasado el día 30 no (30 días y 10 min → 409)', async () => {
      const { body: inTime } = await publish('docente01', cs3AMath).expect(201);
      await del('docente01', `/materials/${inTime.id}`).expect(204);
      await prisma.material.update({
        where: { id: inTime.id },
        data: { deletedAt: new Date(Date.now() - 30 * DAY + 600_000) },
      });
      const ok = await post('docente01', `/materials/${inTime.id}/restore`).expect(200);
      expect(ok.body.deletedAt).toBeNull();

      const { body: late } = await publish('docente01', cs3AMath).expect(201);
      await del('docente01', `/materials/${late.id}`).expect(204);
      await prisma.material.update({
        where: { id: late.id },
        data: { deletedAt: new Date(Date.now() - 30 * DAY - 600_000) },
      });
      await post('docente01', `/materials/${late.id}/restore`).expect(409);
      expect(
        (await prisma.material.findUniqueOrThrow({ where: { id: late.id } })).deletedAt,
      ).not.toBeNull();
    });

    it('RN-12: un docente ajeno no restaura ni ve la papelera de otra sección (403)', async () => {
      const { body: created } = await publish('docente01', cs3AMath).expect(201);
      await del('docente01', `/materials/${created.id}`).expect(204);
      await post('docente02', `/materials/${created.id}/restore`).expect(403);
      await get('docente02', `/course-sections/${cs3AMath}/materials?includeDeleted=true`).expect(
        403,
      );
      await get('apoderado01', `/course-sections/${cs3AMath}/materials?includeDeleted=true`).expect(
        403,
      );
      await post('apoderado01', `/materials/${created.id}/restore`).expect(403);
      const row = await prisma.material.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.deletedAt).not.toBeNull();
    });

    it('restaurar con el archivo purgado → 409 y sigue en la papelera', async () => {
      const { body: created } = await publish('docente01', cs3AMath).expect(201);
      await del('docente01', `/materials/${created.id}`).expect(204);
      await prisma.storedFile.update({
        where: { id: created.fileId },
        data: { purgedAt: new Date() },
      });
      await post('docente01', `/materials/${created.id}/restore`).expect(409);
    });

    it('restaurar tampoco se permite con el período cerrado (409)', async () => {
      const { body: created } = await publish('docente01', cs3AMath, {
        periodId: period3Of2026,
      }).expect(201);
      await del('docente01', `/materials/${created.id}`).expect(204);
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: new Date() },
      });
      try {
        await post('docente01', `/materials/${created.id}/restore`).expect(409);
      } finally {
        await prisma.academicPeriod.update({
          where: { id: period3Of2026 },
          data: { closedAt: null },
        });
      }
    });

    it('restaurar después de 30 días → 409 y sigue en la papelera', async () => {
      const { body: created } = await publish('docente01', cs3AMath).expect(201);
      await del('docente01', `/materials/${created.id}`).expect(204);
      await prisma.material.update({
        where: { id: created.id },
        data: { deletedAt: new Date(Date.now() - 31 * DAY) },
      });
      await post('docente01', `/materials/${created.id}/restore`).expect(409);
      await post('admin', `/materials/${created.id}/restore`).expect(409);
      const row = await prisma.material.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(auditOf('contents.material.restored')).toHaveLength(0);
    });
  });
});
