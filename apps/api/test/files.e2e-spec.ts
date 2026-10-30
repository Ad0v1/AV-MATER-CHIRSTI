import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { FilesEventPublisher, type FilesEvent } from './../src/modules/files/files-events.js';
import { StorageService } from './../src/modules/storage/index.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 3b de Dev 3 (RF-33..35, RF-40, RNF-03/18) con MySQL, MinIO y ClamAV reales de Docker
// (solo local). Usa el seed: 3.° A Matemática 2026 (docente01, estudiante01) y el período 4.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const MiB = 1024 * 1024;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
// Nombre con datos del alumno: no debe llegar a la bitácora ni a los eventos.
const ORIGINAL_NAME = 'Entrega de Juana Pérez.pdf';

const pdf = (body = 'BT /F1 12 Tf (Hola) Tj ET') =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n` +
      'trailer\n<< /Root 1 0 R >>\n%%EOF\n',
    'latin1',
  );

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Archivos fase 3b (e2e, MySQL + MinIO + ClamAV)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let endpoint: string;
  let sink: MemoryAuditSink;
  let events: FilesEvent[];
  let off: () => void;

  const cookies = new Map<string, string>();
  const fileIds: string[] = [];
  const assignmentIds: string[] = [];

  let cs3A: string;
  let cs3B: string;
  let periodId: string;
  let openAssignment: string;
  let smallAssignment: string;
  let pastAssignment: string;
  let lateAssignment: string;
  let teacherAId: string;

  const http = () => request(app.getHttpServer());
  const post = (key: string | null, url: string, body?: object) => {
    const req = http().post(API + url);
    if (key) req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`);
    return req.send(body);
  };

  const intent = (key: string, over: Json = {}) =>
    post(key, '/files/upload-intents', {
      purpose: 'SUBMISSION',
      courseSectionId: cs3A,
      assignmentId: openAssignment,
      fileName: ORIGINAL_NAME,
      contentType: 'application/pdf',
      ...over,
    });

  /** Pide la intención, sube con la URL PUT firmada (como el navegador) y devuelve el fileId. */
  const uploadAs = async (key: string, content: Buffer, over: Json = {}) => {
    const res = await intent(key, { sizeBytes: content.length, ...over });
    expect(res.status).toBe(201);
    fileIds.push(res.body.fileId);
    const put = await fetch(res.body.uploadUrl, {
      method: 'PUT',
      headers: res.body.headers,
      body: new Uint8Array(content),
    });
    expect(put.status).toBe(200);
    return res.body.fileId as string;
  };

  const row = (id: string) => prisma.storedFile.findUniqueOrThrow({ where: { id } });
  const objectExists = async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const storage = loadStorageConfig();
    bucket = storage.bucket;
    endpoint = storage.endpoint!;
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });

    const year = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const csOf = (code: string) =>
      prisma.courseSection.findFirstOrThrow({
        where: {
          course: { name: 'Matemática' },
          section: { academicYearId: year.id, gradeLevel: 3, code },
        },
        include: { teacher: true },
      });
    const a = await csOf('A');
    const b = await csOf('B');
    cs3A = a.id;
    cs3B = b.id;
    periodId = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: year.id, closedAt: null },
        orderBy: { sequence: 'desc' },
      })
    ).id;

    const student3B = await prisma.enrollment.findFirstOrThrow({
      where: { sectionId: b.sectionId, isCurrent: true, student: { status: 'ACTIVE' } },
      include: { student: true },
    });
    const estudiante01 = await prisma.user.findUniqueOrThrow({
      where: { institutionalEmail: 'estudiante01@colegio.example' },
    });
    const guardianLink = await prisma.guardianStudent.findFirstOrThrow({
      where: { studentId: estudiante01.id, isActive: true },
      include: { guardian: true },
    });

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    events = [];
    off = app
      .get(FilesEventPublisher)
      .on('submission.rejected.v1', (e) => void events.push(e as FilesEvent));

    const sessions = app.get(SessionService);
    const users: Array<[string, { id: string; role: string }]> = [
      [
        'admin',
        await prisma.user.findUniqueOrThrow({
          where: { institutionalEmail: 'admin@colegio.example' },
        }),
      ],
      ['docenteA', a.teacher!],
      ['docenteB', b.teacher!],
      ['alumnoA', estudiante01],
      ['alumnoB', student3B.student],
      ['apoderado', guardianLink.guardian],
    ];
    for (const [key, user] of users) {
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    const create = async (data: Json) => {
      const created = await prisma.assignment.create({
        data: {
          courseSectionId: cs3A,
          periodId,
          title: 'QA-3b tarea',
          instructions: 'Prueba e2e de archivos',
          createdById: a.teacher!.id,
          ...data,
        } as never,
      });
      assignmentIds.push(created.id);
      return created.id;
    };
    const inAWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    openAssignment = await create({ dueAt: inAWeek });
    smallAssignment = await create({ dueAt: inAWeek, maxSizeBytes: 2048 });
    pastAssignment = await create({ dueAt: new Date(Date.now() - 3600 * 1000) });
    lateAssignment = await create({ dueAt: new Date(Date.now() - 3600 * 1000), allowLate: true });
    teacherAId = a.teacher!.id;
  });

  afterAll(async () => {
    try {
      off?.();
      const files = await prisma.storedFile.findMany({ where: { id: { in: fileIds } } });
      for (const f of files) {
        await app
          .get(StorageService)
          .deleteObject(f.objectKey)
          .catch(() => undefined);
      }
      await prisma.material.deleteMany({ where: { fileId: { in: fileIds } } });
      await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
      await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    } finally {
      await app?.close();
      await prisma?.$disconnect();
      s3?.destroy();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
    events.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Roles y permisos de la intención', () => {
    it('401 sin sesión y 403 para el apoderado', async () => {
      expect((await post(null, '/files/upload-intents', {})).status).toBe(401);
      const res = await intent('apoderado', { sizeBytes: 100 });
      expect(res.status).toBe(403);
    });

    it('403: el docente no entrega y el alumno de otra sección tampoco', async () => {
      expect((await intent('docenteA', { sizeBytes: 100 })).status).toBe(403);
      expect((await intent('alumnoB', { sizeBytes: 100 })).status).toBe(403);
    });

    it('400 con un campo de más o un contentType distinto de PDF', async () => {
      expect((await intent('alumnoA', { sizeBytes: 100, extra: 1 })).status).toBe(400);
      expect((await intent('alumnoA', { sizeBytes: 100, contentType: 'image/png' })).status).toBe(
        400,
      );
    });

    it('RF-37: 409 DEADLINE_PASSED si la tarea venció y no admite tardías', async () => {
      const res = await intent('alumnoA', { sizeBytes: 100, assignmentId: pastAssignment });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DEADLINE_PASSED');
    });

    it('el docente asignado pide subir un material (tope 50 MiB); el otro docente no', async () => {
      const body = { purpose: 'MATERIAL', assignmentId: undefined, sizeBytes: 30 * MiB };
      const res = await intent('docenteA', body);
      expect(res.status).toBe(201);
      fileIds.push(res.body.fileId);
      expect(res.body.maxBytes).toBe(50 * MiB);
      expect((await intent('docenteB', body)).status).toBe(403);
      const own = await intent('docenteB', { ...body, courseSectionId: cs3B });
      expect(own.status).toBe(201);
      fileIds.push(own.body.fileId);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Flujo completo con MinIO y ClamAV', () => {
    let cleanId: string;
    const content = pdf();

    it('RF-33/RNF-18: sube directo a MinIO, confirma CLEAN y mueve el objeto fuera de la cuarentena', async () => {
      cleanId = await uploadAs('alumnoA', content);
      const before = await row(cleanId);
      expect(before.objectKey.startsWith('incoming/')).toBe(true);
      expect(before.objectKey).not.toContain('Juana');

      const res = await post('alumnoA', `/files/${cleanId}/complete`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        fileId: cleanId,
        scanStatus: 'CLEAN',
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      });

      const after = await row(cleanId);
      expect(after).toMatchObject({ uploadStatus: 'COMPLETED', scanStatus: 'CLEAN' });
      expect(after.objectKey).toMatch(/^submissions\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
      expect(after.completedAt?.toISOString()).toBe(res.body.completedAt);
      expect(await objectExists(before.objectKey)).toBe(false);
      expect(await objectExists(after.objectKey)).toBe(true);
      expect(sink.records.map((r) => r.action)).toEqual([
        'files.upload-intent.created',
        'files.upload.accepted',
      ]);
      expect(JSON.stringify(sink.records)).not.toContain('Juana');
    });

    it('confirmar otra vez es idempotente', async () => {
      const res = await post('alumnoA', `/files/${cleanId}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.scanStatus).toBe('CLEAN');
    });

    it('404 si otro usuario intenta confirmar la subida', async () => {
      expect((await post('alumnoB', `/files/${cleanId}/complete`)).status).toBe(404);
    });

    it('QA-012: la URL firmada solo se entrega tras verificar permisos', async () => {
      expect((await post(null, `/files/${cleanId}/download-url`)).status).toBe(401);
      for (const key of ['alumnoB', 'docenteB', 'apoderado']) {
        const res = await post(key, `/files/${cleanId}/download-url`);
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toContain('X-Amz-Signature');
      }
      for (const key of ['alumnoA', 'docenteA', 'admin']) {
        const res = await post(key, `/files/${cleanId}/download-url`, {
          inline: key === 'docenteA',
        });
        expect(res.status).toBe(200);
        expect(res.body.method).toBe('GET');
        const ttl = (Date.parse(res.body.expiresAt) - Date.now()) / 1000;
        expect(ttl).toBeGreaterThan(30);
        expect(ttl).toBeLessThanOrEqual(61);
      }
      const ok = await post('alumnoA', `/files/${cleanId}/download-url`);
      const download = await fetch(ok.body.url);
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer()).equals(content)).toBe(true);
      expect(download.headers.get('content-disposition')).toContain('attachment;');
    });

    it('RNF-03: el bucket es privado (sin firma, 403)', async () => {
      const { objectKey } = await row(cleanId);
      const res = await fetch(`${endpoint}/${bucket}/${objectKey}`);
      expect(res.status).toBe(403);
    });

    it('404 al pedir la descarga de un archivo pendiente', async () => {
      const res = await intent('alumnoA', { sizeBytes: 100 });
      fileIds.push(res.body.fileId);
      expect((await post('alumnoA', `/files/${res.body.fileId}/download-url`)).status).toBe(404);
      // Sin haber subido nada: 409 y el estado no cambia (se puede reintentar).
      const complete = await post('alumnoA', `/files/${res.body.fileId}/complete`);
      expect(complete.status).toBe(409);
      expect(complete.body.error.code).toBe('UPLOAD_NOT_FOUND');
      expect((await row(res.body.fileId)).uploadStatus).toBe('PENDING');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Rechazos (QA-005, QA-006, QA-011)', () => {
    const expectRejected = async (id: string, reason: string, scanStatus: string) => {
      const after = await row(id);
      expect(after).toMatchObject({ uploadStatus: 'COMPLETED', scanStatus, rejectReason: reason });
      expect(await objectExists(after.objectKey)).toBe(false);
      expect((await post('alumnoA', `/files/${id}/download-url`)).status).toBe(404);
      expect(events).toEqual([
        expect.objectContaining({
          type: 'submission.rejected.v1',
          payload: expect.objectContaining({ uploadId: id, reason }) as unknown,
        }),
      ]);
      expect(JSON.stringify([sink.records, events])).not.toContain('Juana');
    };

    it('QA-005: un archivo que no es PDF (texto con extensión .pdf) responde 415', async () => {
      const id = await uploadAs('alumnoA', Buffer.from('esto no es un pdf, es texto plano'));
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('INVALID_PDF');
      await expectRejected(id, 'NOT_PDF', 'INVALID');
    });

    it('RF-34: un PDF cifrado responde 415 ENCRYPTED_PDF', async () => {
      const encrypted = Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF\n',
        'latin1',
      );
      const id = await uploadAs('alumnoA', encrypted);
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('ENCRYPTED_PDF');
      await expectRejected(id, 'ENCRYPTED_PDF', 'INVALID');
    });

    it('QA-006: 413 al pedir subir más que el tope de la tarea (20 MiB + 1)', async () => {
      const res = await intent('alumnoA', { sizeBytes: 20 * MiB + 1 });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('QA-006: la URL firmada no admite más bytes que los declarados', async () => {
      const res = await intent('alumnoA', { sizeBytes: 100 });
      fileIds.push(res.body.fileId);
      const put = await fetch(res.body.uploadUrl, {
        method: 'PUT',
        headers: res.body.headers,
        body: new Uint8Array(pdf('x'.repeat(500))),
      });
      expect(put.ok).toBe(false);
    });

    it('QA-006: 413 si el objeto real supera el tope (subida que salta la URL firmada)', async () => {
      const res = await intent('alumnoA', { sizeBytes: 1000, assignmentId: smallAssignment });
      expect(res.status).toBe(201);
      expect(res.body.maxBytes).toBe(2048);
      fileIds.push(res.body.fileId);
      const { objectKey } = await row(res.body.fileId);
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: pdf('x'.repeat(4096)) }),
      );
      const complete = await post('alumnoA', `/files/${res.body.fileId}/complete`);
      expect(complete.status).toBe(413);
      await expectRejected(res.body.fileId, 'TOO_LARGE', 'INVALID');
      expect((await row(res.body.fileId)).sizeBytes).toBeNull();
    });

    it('QA-011: un PDF con EICAR responde 422 y queda INFECTED sin poder descargarse', async () => {
      const id = await uploadAs('alumnoA', pdf(EICAR));
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FILE_INFECTED');
      await expectRejected(id, 'INFECTED', 'INFECTED');
      // Confirmar otra vez repite el rechazo y no vuelve a publicar el evento.
      events.length = 0;
      expect((await post('alumnoA', `/files/${id}/complete`)).status).toBe(422);
      expect(events).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Huecos de QA (3b): límites, re-PUT, plazo y descargas', () => {
    it('RF-34: un PDF sin %%EOF responde 415 INVALID_PDF y se borra de incoming/', async () => {
      const id = await uploadAs('alumnoA', Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\n', 'latin1'));
      const key = (await row(id)).objectKey;
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('INVALID_PDF');
      expect(await objectExists(key)).toBe(false);
      // Complete tras el rechazo repite el mismo error y no cambia el estado.
      expect((await post('alumnoA', `/files/${id}/complete`)).status).toBe(415);
      expect(await row(id)).toMatchObject({ scanStatus: 'INVALID', rejectReason: 'NOT_PDF' });
    });

    it('QA-006: tamaño justo en maxBytes se acepta y un byte más se rechaza con 413', async () => {
      const base = pdf('x');
      const fill = 'y'.repeat(2046 - base.length - 1);
      const exact = pdf('x' + fill);
      expect(exact.length).toBe(2048);
      const okId = await uploadAs('alumnoA', exact, { assignmentId: smallAssignment });
      expect((await post('alumnoA', `/files/${okId}/complete`)).status).toBe(200);

      const over = await intent('alumnoA', { sizeBytes: 2049, assignmentId: smallAssignment });
      expect(over.status).toBe(413);
    });

    it('RNF-18: un re-PUT después de complete no altera el archivo definitivo', async () => {
      const original = pdf('original');
      const id = await uploadAs('alumnoA', original);
      const intentKey = (await row(id)).objectKey;
      expect((await post('alumnoA', `/files/${id}/complete`)).status).toBe(200);
      const finalKey = (await row(id)).objectKey;
      expect(finalKey.startsWith('submissions/')).toBe(true);
      expect(finalKey).not.toBe(intentKey);

      // La clave de la cuarentena ya no es la del archivo: un PUT ahí no toca el definitivo.
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: intentKey, Body: pdf('malicioso') }),
      );
      const download = await post('alumnoA', `/files/${id}/download-url`);
      const body = Buffer.from(await (await fetch(download.body.url)).arrayBuffer());
      expect(body.equals(original)).toBe(true);
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: intentKey }));
    });

    it('re-PUT antes de confirmar: se valida y copia solo lo que se leyó (sha256 del contenido final)', async () => {
      const id = await uploadAs('alumnoA', pdf('primero'));
      const { objectKey } = await row(id);
      const second = pdf('segundo contenido');
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: second }));
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.sha256).toBe(createHash('sha256').update(second).digest('hex'));
    });

    it('RF-37: con allowLate se pide la subida y se confirma pasada la fecha límite', async () => {
      const id = await uploadAs('alumnoA', pdf('tarde'), { assignmentId: lateAssignment });
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.scanStatus).toBe('CLEAN');
    });

    it('RF-37: si la tarea vence entre el intent y el complete responde 409 y borra el objeto', async () => {
      const soon = await prisma.assignment.create({
        data: {
          courseSectionId: cs3A,
          periodId,
          title: 'QA-3b vence pronto',
          instructions: 'x',
          createdById: teacherAId,
          dueAt: new Date(Date.now() + 60_000),
        },
      });
      assignmentIds.push(soon.id);
      const id = await uploadAs('alumnoA', pdf('a tiempo'), { assignmentId: soon.id });
      await prisma.assignment.update({
        where: { id: soon.id },
        data: { dueAt: new Date(Date.now() - 1000) },
      });
      const key = (await row(id)).objectKey;
      const res = await post('alumnoA', `/files/${id}/complete`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DEADLINE_PASSED');
      expect((await row(id)).uploadStatus).toBe('EXPIRED');
      expect(await objectExists(key)).toBe(false);
      expect((await post('alumnoA', `/files/${id}/complete`)).status).toBe(409);
    });

    it('un archivo INFECTED no se descarga (404) para nadie, ni docente ni admin', async () => {
      const id = await uploadAs('alumnoA', pdf(EICAR));
      expect((await post('alumnoA', `/files/${id}/complete`)).status).toBe(422);
      for (const key of ['alumnoA', 'docenteA', 'admin']) {
        expect((await post(key, `/files/${id}/download-url`)).status).toBe(404);
      }
    });

    it('material: sin publicar solo el autor y ADMIN; publicado los miembros; apoderado y otra sección no; papelera solo docente', async () => {
      const content = pdf('material');
      const id = await uploadAs('docenteA', content, {
        purpose: 'MATERIAL',
        assignmentId: undefined,
      });
      expect((await post('docenteA', `/files/${id}/complete`)).status).toBe(200);
      expect((await post('alumnoA', `/files/${id}/download-url`)).status).toBe(403);
      expect((await post('docenteA', `/files/${id}/download-url`)).status).toBe(200);
      expect((await post('admin', `/files/${id}/download-url`)).status).toBe(200);

      const material = await prisma.material.create({
        data: {
          courseSectionId: cs3A,
          periodId,
          kind: 'CLASS',
          title: 'QA-3b material',
          fileId: id,
          createdById: teacherAId,
        },
      });
      expect((await post('alumnoA', `/files/${id}/download-url`)).status).toBe(200);
      expect((await post('alumnoB', `/files/${id}/download-url`)).status).toBe(403);
      expect((await post('docenteB', `/files/${id}/download-url`)).status).toBe(403);
      expect((await post('apoderado', `/files/${id}/download-url`)).status).toBe(403);

      await prisma.material.update({
        where: { id: material.id },
        data: { deletedAt: new Date(), deletedById: teacherAId },
      });
      expect((await post('alumnoA', `/files/${id}/download-url`)).status).toBe(404);
      expect((await post('docenteA', `/files/${id}/download-url`)).status).toBe(200);
    });
  });
});
