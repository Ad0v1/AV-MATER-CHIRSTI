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
import {
  ensureSubmissionVersionTrigger,
  withoutSubmissionVersionTrigger,
} from './db-test-guard.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 3c de Dev 3 (RF-28/29, RN-05/08/10/12/14). MySQL real con el seed cargado (solo local).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE_PREFIX = 'QA-3C ';
const KEY_PREFIX = 'qa-3c/';
const FUTURE = '2099-12-01T23:59:00-05:00';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// SubmissionVersion es inmutable (triggers de la migración contents_base). Para limpiar las
// versiones de prueba se quita el trigger de DELETE y se repone al terminar, siempre detrás de la
// guarda de BD local de db-test-guard.ts (INFORME 6 de seguridad); beforeAll lo repone si una
// corrida anterior se interrumpió a la mitad.

describe.skipIf(!process.env.DATABASE_URL)('Tareas de Dev 3, fase 3c (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ddl: PrismaClient; // protocolo de texto: DROP/CREATE TRIGGER no van como sentencia preparada
  let sink: MemoryAuditSink;
  let events: ContentsEvent[];
  let unsubscribe: Array<() => void> = [];

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();

  let cs3AMath: string;
  let cs3BMath: string;
  let period1Of2026: string; // cerrado en el seed
  let period3Of2026: string;
  let period4Of2026: string;
  let period1Of2025: string;
  let enrollment01In3A: string;

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
  const eventsOf = (type: ContentsEvent['type']) => events.filter((e) => e.type === type);

  const body = (extra: object = {}) => ({
    periodId: period4Of2026,
    title: `${TITLE_PREFIX}Práctica`,
    instructions: 'Resolver y subir en PDF',
    dueAt: FUTURE,
    ...extra,
  });
  const createAs = (key: string, cs: string, extra: object = {}) =>
    post(key, `/course-sections/${cs}/assignments`, body(extra));

  /** StoredFile de prueba directo en la BD (la subida real es de la fase 3b). */
  const makeFile = async (
    courseSectionId: string,
    opts: {
      purpose?: 'ASSIGNMENT_ATTACHMENT' | 'SUBMISSION' | 'MATERIAL';
      clean?: boolean;
      assignmentId?: string;
    } = {},
  ) => {
    const clean = opts.clean ?? true;
    const file = await prisma.storedFile.create({
      data: {
        objectKey: `${KEY_PREFIX}${randomUUID()}`,
        purpose: opts.purpose ?? 'ASSIGNMENT_ATTACHMENT',
        courseSectionId,
        assignmentId: opts.assignmentId,
        uploadedById: ids.get('docente01')!,
        originalName: 'qa.pdf',
        maxBytes: 20971520,
        intentExpiresAt: new Date(Date.now() + 300_000),
        ...(clean
          ? {
              uploadStatus: 'COMPLETED',
              scanStatus: 'CLEAN',
              sizeBytes: 1024,
              sha256: createHash('sha256').update(randomUUID()).digest('hex'),
              completedAt: new Date(),
              scannedAt: new Date(),
            }
          : {}),
      },
    });
    return file.id;
  };

  const ensureNoDeleteTrigger = () => ensureSubmissionVersionTrigger(ddl);

  const cleanQaData = async () => {
    const assignments = await prisma.assignment.findMany({
      where: { title: { startsWith: TITLE_PREFIX } },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);
    const versions = await prisma.submissionVersion.count({
      where: { submission: { assignmentId: { in: assignmentIds } } },
    });
    if (versions > 0) {
      await withoutSubmissionVersionTrigger(ddl, () =>
        prisma.submissionVersion.deleteMany({
          where: { submission: { assignmentId: { in: assignmentIds } } },
        }),
      );
    }
    await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.storedFile.deleteMany({
      where: { objectKey: { startsWith: KEY_PREFIX }, purpose: 'SUBMISSION' },
    });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.storedFile.deleteMany({ where: { objectKey: { startsWith: KEY_PREFIX } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    ddl = new PrismaClient({
      adapter: new PrismaMariaDb(process.env.DATABASE_URL!, { useTextProtocol: true }),
    });
    await ensureNoDeleteTrigger();
    await cleanQaData();

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const y2025 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } });
    const periodOf = async (academicYearId: string, sequence: number) =>
      (await prisma.academicPeriod.findFirstOrThrow({ where: { academicYearId, sequence } })).id;
    period1Of2026 = await periodOf(y2026.id, 1);
    period3Of2026 = await periodOf(y2026.id, 3);
    period4Of2026 = await periodOf(y2026.id, 4);
    period1Of2025 = await periodOf(y2025.id, 1);
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
    const publisher = app.get(ContentsEventPublisher);
    unsubscribe = (['assignment.created.v1', 'assignment.updated.v1'] as const).map((type) =>
      publisher.on(type, (e) => void events.push(e as ContentsEvent)),
    );

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
    const section3A = await prisma.courseSection.findUniqueOrThrow({ where: { id: cs3AMath } });
    enrollment01In3A = (
      await prisma.enrollment.findFirstOrThrow({
        where: {
          studentId: ids.get('estudiante01'),
          sectionId: section3A.sectionId,
          isCurrent: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      unsubscribe.forEach((off) => off());
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: null },
      });
      await cleanQaData();
      await ensureNoDeleteTrigger();
    } finally {
      await app?.close();
      await prisma.$disconnect();
      await ddl.$disconnect();
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
      await http().get(`${API}/course-sections/${id}/assignments`).expect(401);
      await http().post(`${API}/course-sections/${id}/assignments`).send({}).expect(401);
      await http().get(`${API}/assignments/${id}`).expect(401);
      await http().patch(`${API}/assignments/${id}`).send({}).expect(401);
      await http().delete(`${API}/assignments/${id}`).expect(401);
    });

    it('RN-12: el apoderado no ve tareas (403), aunque su hijo esté en el curso', async () => {
      const created = await createAs('docente01', cs3AMath).expect(201);
      await get('apoderado01', `/course-sections/${cs3AMath}/assignments`).expect(403);
      await get('apoderado01', `/assignments/${created.body.id}`).expect(403);
      await createAs('apoderado01', cs3AMath).expect(403);
    });

    it('400 con id no UUID; 404 con curso-sección o tarea inexistentes', async () => {
      await get('docente01', '/course-sections/no-es-uuid/assignments').expect(400);
      await get('docente01', '/assignments/no-es-uuid').expect(400);
      await get('admin', `/course-sections/${randomUUID()}/assignments`).expect(404);
      await get('admin', `/assignments/${randomUUID()}`).expect(404);
      await createAs('admin', randomUUID()).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Crear (RF-28, RN-05, RN-08, RN-10)', () => {
    it('QA-003: sin nota NE explícita se guarda 0; tamaño 20 MiB; bitácora y evento sin textos', async () => {
      const res = await createAs('docente01', cs3AMath).expect(201);
      expect(res.body).toMatchObject({
        courseSectionId: cs3AMath,
        periodId: period4Of2026,
        title: `${TITLE_PREFIX}Práctica`,
        dueAt: '2099-12-02T04:59:00.000Z',
        maxSizeBytes: 20971520,
        noSubmissionGrade: '0.00',
        allowLate: false,
        attachmentFileId: null,
        periodIsOpen: true,
      });
      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.noSubmissionGrade.toFixed(2)).toBe('0.00');
      expect(row.createdById).toBe(ids.get('docente01'));

      const [audit] = auditOf('contents.assignment.created');
      expect(audit).toMatchObject({
        module: 'contents',
        entityType: 'Assignment',
        entityId: res.body.id,
        actorId: ids.get('docente01'),
      });
      expect(JSON.stringify(audit)).not.toContain(TITLE_PREFIX);
      expect(JSON.stringify(audit)).not.toContain('Resolver');

      const [event] = eventsOf('assignment.created.v1');
      expect(event.payload).toEqual({
        assignmentId: res.body.id,
        courseSectionId: cs3AMath,
        periodId: period4Of2026,
        dueAt: '2099-12-02T04:59:00.000Z',
        allowLate: false,
        createdAt: res.body.createdAt,
      });
    });

    it('QA-004: un límite mayor a 50 MiB se rechaza (400); 50 MiB exactos se aceptan', async () => {
      const res = await createAs('docente01', cs3AMath, { maxSizeBytes: 52428801 }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      await createAs('docente01', cs3AMath, { maxSizeBytes: 52428800 }).expect(201);
      expect(await prisma.assignment.count({ where: { maxSizeBytes: 52428801 } })).toBe(0);
    });

    it('RN-05: nota NE 0..20 con 2 decimales (texto o número); fuera de rango 400', async () => {
      const ok = await createAs('docente01', cs3AMath, { noSubmissionGrade: 10.5 }).expect(201);
      expect(ok.body.noSubmissionGrade).toBe('10.50');
      await createAs('docente01', cs3AMath, { noSubmissionGrade: 20.01 }).expect(400);
      await createAs('docente01', cs3AMath, { noSubmissionGrade: '1.234' }).expect(400);
    });

    it('400 con campos de más (Zod estricto) o sin zona horaria en dueAt', async () => {
      await createAs('docente01', cs3AMath, { deletedAt: null }).expect(400);
      await createAs('docente01', cs3AMath, { dueAt: '2099-12-01T23:59:00' }).expect(400);
    });

    it('RN-10: período cerrado → 409; período de otro año → 422; plazo pasado → 422', async () => {
      const before = await prisma.assignment.count();
      await createAs('docente01', cs3AMath, { periodId: period1Of2026 }).expect(409);
      await createAs('docente01', cs3AMath, { periodId: period1Of2025 }).expect(422);
      await createAs('docente01', cs3AMath, { periodId: randomUUID() }).expect(404);
      await createAs('docente01', cs3AMath, { dueAt: '2020-01-01T00:00:00Z' }).expect(422);
      expect(await prisma.assignment.count()).toBe(before);
      expect(auditOf('contents.assignment.created')).toHaveLength(0);
      expect(events).toHaveLength(0);
    });

    it('RN-12: docente ajeno → 403; estudiante → 403; ADMIN crea (modo soporte, auditado)', async () => {
      await createAs('docente02', cs3AMath).expect(403);
      await createAs('estudiante01', cs3AMath).expect(403);
      const res = await createAs('admin', cs3AMath).expect(201);
      expect(auditOf('contents.assignment.created')[0].actorId).toBe(ids.get('admin'));
      expect(res.body.courseSectionId).toBe(cs3AMath);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Leer (RF-28, RN-12)', () => {
    let assignmentId: string;

    beforeAll(async () => {
      const res = await createAs('docente01', cs3AMath, { title: `${TITLE_PREFIX}Lectura` });
      assignmentId = res.body.id;
    });

    it('docente titular, estudiante matriculado y ADMIN leen la lista y el detalle', async () => {
      for (const key of ['docente01', 'estudiante01', 'admin']) {
        const list = await get(key, `/course-sections/${cs3AMath}/assignments`).expect(200);
        expect(
          list.body.items.map((a: Json) => a.id),
          key,
        ).toContain(assignmentId);
        expect(list.body.total).toBe(list.body.items.length);
        await get(key, `/assignments/${assignmentId}`).expect(200);
      }
    });

    it('filtra por período', async () => {
      const res = await get(
        'docente01',
        `/course-sections/${cs3AMath}/assignments?periodId=${period3Of2026}`,
      ).expect(200);
      expect(res.body.items.map((a: Json) => a.id)).not.toContain(assignmentId);
      await get('docente01', `/course-sections/${cs3AMath}/assignments?otro=1`).expect(400);
    });

    it('docente ajeno y estudiante de otra sección → 403', async () => {
      await get('docente02', `/course-sections/${cs3AMath}/assignments`).expect(403);
      await get('docente02', `/assignments/${assignmentId}`).expect(403);
      await get('estudiante11', `/course-sections/${cs3AMath}/assignments`).expect(403);
      await get('estudiante11', `/assignments/${assignmentId}`).expect(403);
      // docente02 sí es titular de 3B, pero la tarea no está ahí.
      const other = await get('docente02', `/course-sections/${cs3BMath}/assignments`).expect(200);
      expect(other.body.items.map((a: Json) => a.id)).not.toContain(assignmentId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Editar (RF-29, RN-10)', () => {
    it('el docente edita; la bitácora lista los campos sin el texto; evento updated.v1', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      sink.records.length = 0;
      events.length = 0;
      const res = await patch('docente01', `/assignments/${created.id}`, {
        title: `${TITLE_PREFIX}Editada`,
        dueAt: '2099-12-10T12:00:00Z',
        allowLate: true,
        noSubmissionGrade: '05.5',
      }).expect(200);
      expect(res.body).toMatchObject({
        title: `${TITLE_PREFIX}Editada`,
        dueAt: '2099-12-10T12:00:00.000Z',
        allowLate: true,
        noSubmissionGrade: '5.50',
      });

      const [audit] = auditOf('contents.assignment.updated');
      expect(audit.afterState).toEqual({
        dueAt: '2099-12-10T12:00:00.000Z',
        allowLate: true,
        noSubmissionGrade: '5.50',
        changedFields: ['title', 'dueAt', 'noSubmissionGrade', 'allowLate'],
      });
      expect(JSON.stringify(audit)).not.toContain('Editada');
      const [event] = eventsOf('assignment.updated.v1');
      expect(event.payload).toMatchObject({
        assignmentId: created.id,
        dueAt: '2099-12-10T12:00:00.000Z',
        allowLate: true,
        changedFields: ['title', 'dueAt', 'noSubmissionGrade', 'allowLate'],
      });

      // Sin cambios reales: 200 sin bitácora ni evento.
      sink.records.length = 0;
      events.length = 0;
      await patch('docente01', `/assignments/${created.id}`, { allowLate: true }).expect(200);
      expect(auditOf('contents.assignment.updated')).toHaveLength(0);
      expect(events).toHaveLength(0);
    });

    it('400: cuerpo vacío, cambiar el período o tamaño mayor a 50 MiB', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente01', `/assignments/${created.id}`, {}).expect(400);
      await patch('docente01', `/assignments/${created.id}`, { periodId: period3Of2026 }).expect(
        400,
      );
      await patch('docente01', `/assignments/${created.id}`, { maxSizeBytes: 52428801 }).expect(
        400,
      );
    });

    it('RN-10: con el período cerrado no se edita ni se borra (409)', async () => {
      const { body: created } = await createAs('docente01', cs3AMath, {
        periodId: period3Of2026,
      }).expect(201);
      await prisma.academicPeriod.update({
        where: { id: period3Of2026 },
        data: { closedAt: new Date() },
      });
      try {
        await patch('docente01', `/assignments/${created.id}`, { allowLate: true }).expect(409);
        await del('docente01', `/assignments/${created.id}`).expect(409);
        const read = await get('estudiante01', `/assignments/${created.id}`).expect(200);
        expect(read.body.periodIsOpen).toBe(false);
      } finally {
        await prisma.academicPeriod.update({
          where: { id: period3Of2026 },
          data: { closedAt: null },
        });
      }
    });

    it('RN-12: docente ajeno, estudiante y apoderado no editan (403)', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente02', `/assignments/${created.id}`, { allowLate: true }).expect(403);
      await patch('estudiante01', `/assignments/${created.id}`, { allowLate: true }).expect(403);
      await patch('apoderado01', `/assignments/${created.id}`, { allowLate: true }).expect(403);
      await patch('admin', `/assignments/${created.id}`, { allowLate: true }).expect(200);
    });

    it('plazo nuevo en el pasado → 422', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente01', `/assignments/${created.id}`, {
        dueAt: '2020-01-01T00:00:00Z',
      }).expect(422);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Adjunto (attachmentFileId)', () => {
    it('acepta un archivo CLEAN de la misma sección y lo puede quitar', async () => {
      const fileId = await makeFile(cs3AMath);
      const res = await createAs('docente01', cs3AMath, { attachmentFileId: fileId }).expect(201);
      expect(res.body.attachmentFileId).toBe(fileId);
      const cleared = await patch('docente01', `/assignments/${res.body.id}`, {
        attachmentFileId: null,
      }).expect(200);
      expect(cleared.body.attachmentFileId).toBeNull();
    });

    it('422: archivo de otra sección, pendiente de escaneo, de otro propósito o inexistente', async () => {
      for (const fileId of [
        await makeFile(cs3BMath),
        await makeFile(cs3AMath, { clean: false }),
        await makeFile(cs3AMath, { purpose: 'MATERIAL' }),
        randomUUID(),
      ]) {
        await createAs('docente01', cs3AMath, { attachmentFileId: fileId }).expect(422);
      }
    });

    it('409: el adjunto ya lo usa otra tarea', async () => {
      const fileId = await makeFile(cs3AMath);
      await createAs('docente01', cs3AMath, { attachmentFileId: fileId }).expect(201);
      await createAs('docente01', cs3AMath, { attachmentFileId: fileId }).expect(409);
      const { body: other } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente01', `/assignments/${other.id}`, { attachmentFileId: fileId }).expect(
        409,
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('Huecos de QA (límites, ajenos, adjuntos y privacidad)', () => {
    it('QA-004: maxSizeBytes 52428800 se acepta y 52428801 se rechaza, al crear y al editar', async () => {
      const ok = await createAs('docente01', cs3AMath, { maxSizeBytes: 52428800 }).expect(201);
      expect(ok.body.maxSizeBytes).toBe(52428800);
      await createAs('docente01', cs3AMath, { maxSizeBytes: 52428801 }).expect(400);
      await createAs('docente01', cs3AMath, { maxSizeBytes: 0 }).expect(400);
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente01', `/assignments/${created.id}`, { maxSizeBytes: 52428801 }).expect(
        400,
      );
      const edited = await patch('docente01', `/assignments/${created.id}`, {
        maxSizeBytes: 52428800,
      }).expect(200);
      expect(edited.body.maxSizeBytes).toBe(52428800);
    });

    it('RN-05: noSubmissionGrade "20.001" y "20.01" → 400; "20.00" y "0" se aceptan; negativa 400', async () => {
      await createAs('docente01', cs3AMath, { noSubmissionGrade: '20.001' }).expect(400);
      await createAs('docente01', cs3AMath, { noSubmissionGrade: '20.01' }).expect(400);
      await createAs('docente01', cs3AMath, { noSubmissionGrade: '-0.01' }).expect(400);
      const max = await createAs('docente01', cs3AMath, { noSubmissionGrade: '20.00' }).expect(201);
      expect(max.body.noSubmissionGrade).toBe('20.00');
      const zero = await createAs('docente01', cs3AMath, { noSubmissionGrade: '0' }).expect(201);
      expect(zero.body.noSubmissionGrade).toBe('0.00');
      await patch('docente01', `/assignments/${zero.body.id}`, {
        noSubmissionGrade: '20.001',
      }).expect(400);
      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: zero.body.id } });
      expect(row.noSubmissionGrade.toFixed(2)).toBe('0.00');
    });

    it('RN-12: el PATCH y el DELETE de una tarea de 3A por el docente de 3B → 403 y no cambia nada', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      sink.records.length = 0;
      events.length = 0;
      await patch('docente02', `/assignments/${created.id}`, {
        title: `${TITLE_PREFIX}Robada`,
      }).expect(403);
      await del('docente02', `/assignments/${created.id}`).expect(403);
      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.title).toBe(`${TITLE_PREFIX}Práctica`);
      expect(row.deletedAt).toBeNull();
      expect(auditOf('contents.assignment.updated')).toHaveLength(0);
      expect(auditOf('contents.assignment.deleted')).toHaveLength(0);
      expect(events).toHaveLength(0);
    });

    it('adjunto de otra sección al editar → 422 y el adjunto actual se conserva', async () => {
      const mine = await makeFile(cs3AMath);
      const { body: created } = await createAs('docente01', cs3AMath, {
        attachmentFileId: mine,
      }).expect(201);
      const foreign = await makeFile(cs3BMath);
      await patch('docente01', `/assignments/${created.id}`, { attachmentFileId: foreign }).expect(
        422,
      );
      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.attachmentFileId).toBe(mine);
    });

    it('RN-10: periodId de otro año en PATCH sigue siendo 400; tarea con período de 2025 no se crea (422)', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      await patch('docente01', `/assignments/${created.id}`, { periodId: period1Of2025 }).expect(
        400,
      );
      await createAs('admin', cs3AMath, { periodId: period1Of2025 }).expect(422);
    });

    it('privacidad: bitácora y eventos de crear/editar no contienen títulos, instrucciones ni nombres', async () => {
      const secret = `${TITLE_PREFIX}Secreto-Perez`;
      const { body: created } = await createAs('docente01', cs3AMath, {
        title: secret,
        instructions: 'Instrucciones-confidenciales',
      }).expect(201);
      await patch('docente01', `/assignments/${created.id}`, {
        title: `${secret}-v2`,
        instructions: 'Otras-instrucciones',
        allowLate: true,
      }).expect(200);
      await del('docente01', `/assignments/${created.id}`).expect(204);
      const dump = JSON.stringify([...sink.records, ...events]);
      for (const leak of [
        'Secreto',
        'Perez',
        'confidenciales',
        'Otras-instrucciones',
        'qa.pdf',
        '@colegio.example',
        'Docente',
      ]) {
        expect(dump, leak).not.toContain(leak);
      }
      expect(auditOf('contents.assignment.created')).toHaveLength(1);
      expect(auditOf('contents.assignment.updated')).toHaveLength(1);
      expect(auditOf('contents.assignment.deleted')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Borrar (borrado lógico, RN-14)', () => {
    it('sin entregas: 204, deletedAt puesto, deja de verse; bitácora deleted', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      sink.records.length = 0;
      await del('docente02', `/assignments/${created.id}`).expect(403);
      await del('estudiante01', `/assignments/${created.id}`).expect(403);
      await del('docente01', `/assignments/${created.id}`).expect(204);

      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.deletedAt).not.toBeNull();
      await get('docente01', `/assignments/${created.id}`).expect(404);
      const list = await get('docente01', `/course-sections/${cs3AMath}/assignments`).expect(200);
      expect(list.body.items.map((a: Json) => a.id)).not.toContain(created.id);
      await patch('docente01', `/assignments/${created.id}`, { allowLate: true }).expect(404);
      await del('docente01', `/assignments/${created.id}`).expect(404);

      const audits = auditOf('contents.assignment.deleted');
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ entityId: created.id, actorId: ids.get('docente01') });
    });

    it('con entregas (SubmissionVersion): 409 y la tarea sigue visible', async () => {
      const { body: created } = await createAs('docente01', cs3AMath).expect(201);
      const submission = await prisma.submission.create({
        data: { assignmentId: created.id, enrollmentId: enrollment01In3A },
      });
      const fileId = await makeFile(cs3AMath, { purpose: 'SUBMISSION', assignmentId: created.id });
      await prisma.submissionVersion.create({
        data: {
          submissionId: submission.id,
          versionNumber: 1,
          fileId,
          receivedAt: new Date(),
          isLate: false,
        },
      });
      sink.records.length = 0;

      await del('docente01', `/assignments/${created.id}`).expect(409);
      await del('admin', `/assignments/${created.id}`).expect(409);
      const row = await prisma.assignment.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.deletedAt).toBeNull();
      await get('estudiante01', `/assignments/${created.id}`).expect(200);
      expect(auditOf('contents.assignment.deleted')).toHaveLength(0);
    });
  });
});
