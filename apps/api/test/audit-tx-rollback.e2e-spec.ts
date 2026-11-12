import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AuditService } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { NeMaterializer } from './../src/modules/grading/ne-materializer.service.js';
import { pngBytes } from './../src/modules/settings/logo-fixtures.mock-spec.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp } from './helpers.js';

// Fase A1 (D-047): la bitácora va dentro de la transacción. Si auditLog.create falla, la acción se
// revierte. Se provoca el fallo con un espía sobre AuditService.record que lanza solo cuando recibe
// `tx`. MySQL y MinIO reales (solo local). AuditLog es de solo inserción: los casos "control"
// dejan sus filas.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE_PREFIX = 'QA-A1 ';
const KEY_PREFIX = 'qa-a1/';
const FUTURE = '2099-12-01T23:59:00-05:00';
const HOUR = 3_600_000;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

describe.skipIf(!process.env.DATABASE_URL)('A1 D-047: rollback si falla la bitácora (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let failing = false;
  let calls: Array<{ action: string; hasTx: boolean }> = [];
  let cs3AMath: string;
  let period4: string;
  let enrollment01: string;
  let originalSettings: Awaited<
    ReturnType<PrismaClient['institutionSettings']['findUniqueOrThrow']>
  >;
  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const auditRows = (action: string, entityId: string) =>
    prisma.auditLog.count({ where: { action, entityId } });

  const makeFile = async (purpose: 'MATERIAL' | 'SUBMISSION', assignmentId?: string) =>
    (
      await prisma.storedFile.create({
        data: {
          objectKey: `${KEY_PREFIX}${randomUUID()}`,
          purpose,
          courseSectionId: cs3AMath,
          assignmentId: purpose === 'SUBMISSION' ? assignmentId : null,
          uploadedById: ids.get(purpose === 'SUBMISSION' ? 'estudiante01' : 'docente01')!,
          originalName: 'qa.pdf',
          maxBytes: 20971520,
          intentExpiresAt: new Date(Date.now() + 300_000),
          uploadStatus: 'COMPLETED',
          scanStatus: 'CLEAN',
          sizeBytes: 2048,
          sha256: createHash('sha256').update(randomUUID()).digest('hex'),
          completedAt: new Date(),
          scannedAt: new Date(),
        },
      })
    ).id;

  const makeAssignment = async (dueAt: Date) =>
    (
      await prisma.assignment.create({
        data: {
          courseSectionId: cs3AMath,
          periodId: period4,
          title: `${TITLE_PREFIX}Tarea ${randomUUID().slice(0, 8)}`,
          instructions: 'Subir en PDF',
          dueAt,
          createdById: ids.get('docente01')!,
        },
      })
    ).id;

  const makeMaterial = async () =>
    (
      await prisma.material.create({
        data: {
          courseSectionId: cs3AMath,
          kind: 'CLASS',
          title: `${TITLE_PREFIX}Clase ${randomUUID().slice(0, 8)}`,
          fileId: await makeFile('MATERIAL'),
          createdById: ids.get('docente01')!,
        },
      })
    ).id;

  const logoKeys = async () => {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'institution/' }));
    return (res.Contents ?? []).map((o) => o.Key!).sort();
  };

  const cleanQa = async () => {
    const assignmentIds = (
      await prisma.assignment.findMany({
        where: { title: { startsWith: TITLE_PREFIX } },
        select: { id: true },
      })
    ).map((a) => a.id);
    await prisma.grade.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.storedFile.deleteMany({
      where: { objectKey: { startsWith: KEY_PREFIX }, purpose: 'SUBMISSION' },
    });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.material.deleteMany({ where: { title: { startsWith: TITLE_PREFIX } } });
    await prisma.storedFile.deleteMany({ where: { objectKey: { startsWith: KEY_PREFIX } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    originalSettings = await prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
    const storage = loadStorageConfig();
    bucket = storage.bucket;
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    });
    await cleanQa();

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    period4 = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, sequence: 4 },
      })
    ).id;
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Matemática' },
        section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
      },
    });
    cs3AMath = cs.id;

    app = await createDbTestApp();
    const audit = app.get(AuditService);
    const original = audit.record.bind(audit);
    vi.spyOn(audit, 'record').mockImplementation((event, tx) => {
      calls.push({ action: event.action, hasTx: tx !== undefined });
      if (failing && tx) return Promise.reject(new Error('auditLog.create falló (simulado)'));
      return original(event, tx);
    });

    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
    enrollment01 = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante01'), sectionId: cs.sectionId, isCurrent: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      failing = false;
      await cleanQa();
    } finally {
      s3?.destroy();
      await app?.close();
      await prisma?.$disconnect();
    }
  });

  beforeEach(() => {
    failing = true;
    calls = [];
  });
  afterEach(() => {
    failing = false;
  });

  describe('Tareas (RF-28, RF-29)', () => {
    it('RF-28: crear con la bitácora caída revierte la tarea (500, 0 filas)', async () => {
      const title = `${TITLE_PREFIX}crear ${randomUUID().slice(0, 8)}`;
      const res = await http()
        .post(`${API}/course-sections/${cs3AMath}/assignments`)
        .set('Cookie', as('docente01'))
        .send({ periodId: period4, title, instructions: 'x', dueAt: FUTURE });
      expect(res.status).toBe(500);
      expect(await prisma.assignment.count({ where: { title } })).toBe(0);
      expect(calls.some((c) => c.action === 'contents.assignment.created' && c.hasTx)).toBe(true);
    });

    it('RF-28: control, con la bitácora sana la tarea y su fila de AuditLog quedan juntas', async () => {
      failing = false;
      const title = `${TITLE_PREFIX}control ${randomUUID().slice(0, 8)}`;
      const res = await http()
        .post(`${API}/course-sections/${cs3AMath}/assignments`)
        .set('Cookie', as('docente01'))
        .send({ periodId: period4, title, instructions: 'x', dueAt: FUTURE })
        .expect(201);
      expect(await auditRows('contents.assignment.created', res.body.id as string)).toBe(1);
    });

    it('RF-29: editar con la bitácora caída deja el título intacto', async () => {
      const id = await makeAssignment(new Date(Date.now() + 24 * HOUR));
      const before = await prisma.assignment.findUniqueOrThrow({ where: { id } });
      const res = await http()
        .patch(`${API}/assignments/${id}`)
        .set('Cookie', as('docente01'))
        .send({ title: `${TITLE_PREFIX}editada` });
      expect(res.status).toBe(500);
      const after = await prisma.assignment.findUniqueOrThrow({ where: { id } });
      expect(after.title).toBe(before.title);
      expect(await auditRows('contents.assignment.updated', id)).toBe(0);
    });

    it('RF-29: borrar con la bitácora caída no marca deletedAt', async () => {
      const id = await makeAssignment(new Date(Date.now() + 24 * HOUR));
      const res = await http().delete(`${API}/assignments/${id}`).set('Cookie', as('docente01'));
      expect(res.status).toBe(500);
      expect((await prisma.assignment.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
      expect(await auditRows('contents.assignment.deleted', id)).toBe(0);
    });
  });

  describe('Materiales (RF-26, RF-27)', () => {
    it('RF-26: publicar con la bitácora caída revierte el material', async () => {
      const title = `${TITLE_PREFIX}mat ${randomUUID().slice(0, 8)}`;
      const res = await http()
        .post(`${API}/course-sections/${cs3AMath}/materials`)
        .set('Cookie', as('docente01'))
        .send({ kind: 'CLASS', title, fileId: await makeFile('MATERIAL') });
      expect(res.status).toBe(500);
      expect(await prisma.material.count({ where: { title } })).toBe(0);
    });

    it('RF-27: editar con la bitácora caída deja el título intacto', async () => {
      const id = await makeMaterial();
      const before = await prisma.material.findUniqueOrThrow({ where: { id } });
      const res = await http()
        .patch(`${API}/materials/${id}`)
        .set('Cookie', as('docente01'))
        .send({ title: `${TITLE_PREFIX}cambiado` });
      expect(res.status).toBe(500);
      expect((await prisma.material.findUniqueOrThrow({ where: { id } })).title).toBe(before.title);
      expect(await auditRows('contents.material.updated', id)).toBe(0);
    });

    it('RF-27: borrar con la bitácora caída no marca deletedAt', async () => {
      const id = await makeMaterial();
      const res = await http().delete(`${API}/materials/${id}`).set('Cookie', as('docente01'));
      expect(res.status).toBe(500);
      expect((await prisma.material.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
      expect(await auditRows('contents.material.deleted', id)).toBe(0);
    });

    it('RF-27: restaurar con la bitácora caída sigue borrado', async () => {
      const id = await makeMaterial();
      await prisma.material.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: ids.get('docente01')! },
      });
      const res = await http()
        .post(`${API}/materials/${id}/restore`)
        .set('Cookie', as('docente01'));
      expect(res.status).toBe(500);
      expect((await prisma.material.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    });
  });

  describe('Entregas (RF-33)', () => {
    it('RF-33: nueva versión con la bitácora caída no crea Submission ni versión', async () => {
      const assignmentId = await makeAssignment(new Date(Date.now() + 24 * HOUR));
      const fileId = await makeFile('SUBMISSION', assignmentId);
      const res = await http()
        .post(`${API}/assignments/${assignmentId}/submissions`)
        .set('Cookie', as('estudiante01'))
        .send({ fileId });
      expect(res.status).toBe(500);
      expect(await prisma.submission.count({ where: { assignmentId } })).toBe(0);
      expect(await prisma.submissionVersion.count({ where: { fileId } })).toBe(0);
      expect(calls.some((c) => c.action === 'submissions.version.created' && c.hasTx)).toBe(true);
    });
  });

  describe('Calificaciones (RF-41, RF-45)', () => {
    it('RF-41: PUT de nota con la bitácora caída no deja Grade', async () => {
      const assignmentId = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const res = await http()
        .put(`${API}/grades/${assignmentId}/${enrollment01}`)
        .set('Cookie', as('admin'))
        .send({ state: 'NE' });
      expect(res.status).toBe(500);
      expect(await prisma.grade.count({ where: { assignmentId } })).toBe(0);
      expect(calls.some((c) => c.action === 'grading.grade.create' && c.hasTx)).toBe(true);
    });

    it('RF-45: la NE automática con la bitácora caída no deja notas; sin el fallo sí, con auto_ne', async () => {
      const assignmentId = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const ne = app.get(NeMaterializer);
      expect(await ne.materializeAssignment(assignmentId, new Date())).toBe(0);
      expect(await prisma.grade.count({ where: { assignmentId } })).toBe(0);

      failing = false;
      const created = await ne.materializeAssignment(assignmentId, new Date());
      expect(created).toBeGreaterThan(0);
      expect(await prisma.grade.count({ where: { assignmentId } })).toBe(created);
      const grade = await prisma.grade.findFirstOrThrow({ where: { assignmentId } });
      expect(await auditRows('grading.grade.auto_ne', grade.id)).toBe(1);
    });
  });

  describe('Configuración (RF-61)', () => {
    it('RF-61: settings.update con la bitácora caída no cambia la fila', async () => {
      const res = await http()
        .put(`${API}/admin/settings`)
        .set('Cookie', as('admin'))
        .send({
          name: `${TITLE_PREFIX}colegio`,
          literalScale: originalSettings.literalScale,
          purgeAfterDays: originalSettings.purgeAfterDays,
        });
      expect(res.status).toBe(500);
      const row = await prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(row.name).toBe(originalSettings.name);
      expect(row.updatedAt.getTime()).toBe(originalSettings.updatedAt.getTime());
    });

    it('RF-61: settings.logo con la bitácora caída revierte la fila y borra el objeto nuevo', async () => {
      const keysBefore = await logoKeys();
      const res = await http()
        .put(`${API}/admin/settings/logo`)
        .set('Cookie', as('admin'))
        .attach('file', pngBytes(), { filename: 'logo.png', contentType: 'image/png' });
      expect(res.status).toBe(500);
      const row = await prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(row.logoObjectKey).toBe(originalSettings.logoObjectKey);
      expect(await logoKeys()).toEqual(keysBefore);
      expect(calls.some((c) => c.action === 'settings.logo.update' && c.hasTx)).toBe(true);
    });
  });
});
