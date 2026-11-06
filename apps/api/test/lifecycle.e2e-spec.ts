import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import type { Job } from 'bullmq';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditService, AuditSink } from './../src/common/audit/audit.service.js';
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { AcademicEventPublisher } from './../src/modules/academic/academic-events.js';
import { FileLifecycleService } from './../src/modules/files/file-lifecycle.service.js';
import {
  BackgroundJobService,
  JobResultStorage,
  type TrackedJobData,
  TrackedJobRunner,
} from './../src/modules/jobs/index.js';
import { LifecycleService } from './../src/modules/lifecycle/lifecycle.service.js';
import {
  buildPersonalData,
  PersonalDataExportProcessor,
} from './../src/modules/lifecycle/processors/personal-data-export.processor.js';
import { PurgeYearProcessor } from './../src/modules/lifecycle/processors/purge-year.processor.js';
import { YearBackupProcessor } from './../src/modules/lifecycle/processors/year-backup.processor.js';
import { QueueService } from './../src/modules/queue/index.js';
import { StorageService } from './../src/modules/storage/index.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 5g de Dev 5 (RF-63, RF-64, RF-65, RF-66, RF-67; U6, U7; seguridad 5b hallazgos 2, 3, 4 y
// 7) contra MySQL y MinIO reales (solo local con Docker). Redis no se usa: se espía
// QueueService.enqueue y los procesadores se ejecutan a mano con el TrackedJobRunner real.
// Crea un año ficticio 2091 (cerrado) con dos secciones y lo borra al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const QA_YEAR = 2091;
const DAY = 86_400_000;
const TITLE_PREFIX = 'QA-5G ';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

const fakeJob = (backgroundJobId: string) =>
  ({ data: { backgroundJobId }, opts: { attempts: 1 }, attemptsMade: 0 }) as Job<TrackedJobData>;

describe.skipIf(!process.env.DATABASE_URL)('Ciclo de vida 5g (e2e, MySQL + MinIO)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let sink: MemoryAuditSink;
  let jobs: BackgroundJobService;
  let results: JobResultStorage;
  let lifecycle: LifecycleService;
  let enqueue: ReturnType<typeof vi.spyOn>;
  let exportProcessor: PersonalDataExportProcessor;
  let backupProcessor: YearBackupProcessor;
  let purgeProcessor: PurgeYearProcessor;

  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  const extraJobIds: string[] = [];
  let yearId: string;
  let sectionZ: string;
  let sectionY: string;
  let csZ: string;
  let fileId: string;
  let fileKey: string;
  let purgeAfterDays: number;

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string | null, url: string) => {
    const req = http().get(API + url);
    return key ? req.set('Cookie', as(key)) : req;
  };
  const post = (key: string | null, url: string) => {
    const req = http().post(API + url);
    return key ? req.set('Cookie', as(key)).send({}) : req.send({});
  };
  const exists = async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  };
  const jobRow = (id: string) => prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);

  /** Borra el año de prueba y todo lo que cuelga de él (también restos de corridas anteriores). */
  const cleanYear = async () => {
    const year = await prisma.academicYear.findUnique({ where: { year: QA_YEAR } });
    if (!year) return;
    const jobsOfYear = await prisma.backgroundJob.findMany({
      where: { academicYearId: year.id },
      select: { resultObjectKey: true },
    });
    for (const j of jobsOfYear) {
      if (j.resultObjectKey) await results.delete(j.resultObjectKey).catch(() => undefined);
    }
    await prisma.backgroundJob.deleteMany({ where: { academicYearId: year.id } });
    const files = await prisma.storedFile.findMany({
      where: { courseSection: { section: { academicYearId: year.id } } },
      select: { id: true },
    });
    await prisma.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await prisma.courseSection.deleteMany({ where: { section: { academicYearId: year.id } } });
    await prisma.section.deleteMany({ where: { academicYearId: year.id } });
    await prisma.academicYear.delete({ where: { id: year.id } });
  };

  /** Trabajos del admin que no son del año (exportaciones de datos personales). */
  const cleanAdminJobs = async () => {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        OR: [
          { id: { in: extraJobIds } },
          { requestedById: ids.get('admin'), status: { in: ['QUEUED', 'RUNNING'] } },
        ],
      },
      select: { id: true, resultObjectKey: true },
    });
    for (const r of rows) {
      if (r.resultObjectKey) await results.delete(r.resultObjectKey).catch(() => undefined);
    }
    await prisma.backgroundJob.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const storage = loadStorageConfig();
    bucket = storage.bucket;
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    });

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    jobs = app.get(BackgroundJobService, { strict: false });
    results = app.get(JobResultStorage, { strict: false });
    lifecycle = app.get(LifecycleService, { strict: false });
    enqueue = vi
      .spyOn(app.get(QueueService, { strict: false }), 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));

    // Procesadores del worker armados con las piezas reales de la API (sin registrarlos).
    const runner = app.get(TrackedJobRunner, { strict: false });
    const prismaService = app.get(PrismaService, { strict: false });
    const audit = app.get(AuditService, { strict: false });
    const storageService = app.get(StorageService, { strict: false });
    const files = app.get(FileLifecycleService, { strict: false });
    exportProcessor = new PersonalDataExportProcessor(
      null as never,
      runner,
      prismaService,
      results,
    );
    backupProcessor = new YearBackupProcessor(
      null as never,
      runner,
      prismaService,
      results,
      storageService,
    );
    purgeProcessor = new PurgeYearProcessor(
      null as never,
      runner,
      prismaService,
      files,
      jobs,
      lifecycle,
      audit,
      results,
    );

    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    await cleanYear();
    await cleanAdminJobs();
    purgeAfterDays = await lifecycle.purgeAfterDays();

    // Año 2091 cerrado ayer, con dos secciones y un PDF en MinIO.
    const year = await prisma.academicYear.create({
      data: { year: QA_YEAR, closedAt: new Date(Date.now() - DAY) },
    });
    yearId = year.id;
    sectionZ = (
      await prisma.section.create({ data: { academicYearId: yearId, gradeLevel: 1, code: 'Z' } })
    ).id;
    sectionY = (
      await prisma.section.create({ data: { academicYearId: yearId, gradeLevel: 2, code: 'Y' } })
    ).id;
    const course = await prisma.course.findFirstOrThrow({ orderBy: { name: 'asc' } });
    csZ = (
      await prisma.courseSection.create({ data: { sectionId: sectionZ, courseId: course.id } })
    ).id;
    const d = new Date();
    fileKey = `materials/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.pdf`;
    const body = Buffer.from('%PDF-1.4 qa-5g');
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: fileKey, Body: body }));
    fileId = (
      await prisma.storedFile.create({
        data: {
          objectKey: fileKey,
          purpose: 'MATERIAL',
          courseSectionId: csZ,
          uploadedById: ids.get('docente01')!,
          originalName: `${TITLE_PREFIX}material.pdf`,
          maxBytes: 1024,
          sizeBytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'),
          uploadStatus: 'COMPLETED',
          scanStatus: 'CLEAN',
          intentExpiresAt: new Date(),
          completedAt: new Date(),
          scannedAt: new Date(),
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      if (results) {
        await cleanYear();
        await cleanAdminJobs();
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  });

  describe('RF-67: uso del almacenamiento', () => {
    it('suma el PDF del año por año, grado y curso; solo ADMIN', async () => {
      const res = await get('admin', `/admin/storage-usage?academicYearId=${yearId}`).expect(200);
      expect(res.body.academicYearId).toBe(yearId);
      expect(res.body.total).toEqual({ bytes: 14, files: 1 });
      expect(res.body.years).toEqual([
        expect.objectContaining({ academicYearId: yearId, year: QA_YEAR, bytes: 14, files: 1 }),
      ]);
      expect(res.body.grades).toEqual([
        { academicYearId: yearId, gradeLevel: 1, bytes: 14, files: 1 },
      ]);
      expect(res.body.courses).toHaveLength(1);

      await get('docente01', '/admin/storage-usage').expect(403);
      await get(null, '/admin/storage-usage').expect(401);
      await get('admin', `/admin/storage-usage?academicYearId=${randomUUID()}`).expect(404);
      await get('admin', '/admin/storage-usage?otro=1').expect(400);
    });
  });

  describe('RF-65: respaldo anual', () => {
    it('academic-year.closed.v1 encola un YEAR_BACKUP por sección, sin duplicar', async () => {
      enqueue.mockClear();
      app.get(AcademicEventPublisher, { strict: false }).publish({
        type: 'academic-year.closed.v1',
        payload: { academicYearId: yearId, year: QA_YEAR, closedAt: new Date().toISOString() },
      } as never);
      await vi.waitFor(
        async () => {
          expect(
            await prisma.backgroundJob.count({
              where: { academicYearId: yearId, type: 'YEAR_BACKUP' },
            }),
          ).toBe(2);
        },
        { timeout: 5000 },
      );
      expect(enqueue).toHaveBeenCalledTimes(2);
      const calls = enqueue.mock.calls as unknown[][];
      expect(calls.every((c) => c[0] === 'lifecycle' && c[1] === 'year-backup')).toBe(true);
      const params = (
        await prisma.backgroundJob.findMany({
          where: { academicYearId: yearId, type: 'YEAR_BACKUP' },
          select: { params: true, requestedById: true },
        })
      ).map((r) => ({ ...(r.params as object), requestedById: r.requestedById }));
      expect(params).toEqual(
        expect.arrayContaining([
          { academicYearId: yearId, sectionId: sectionZ, requestedById: null },
          { academicYearId: yearId, sectionId: sectionY, requestedById: null },
        ]),
      );
      expect(auditOf('lifecycle.backup.enqueue').at(-1)).toMatchObject({
        actorId: undefined,
        entityId: yearId,
        afterState: { sections: 2 },
      });

      // Idempotente: otra vez no crea nada; uno explícito del mismo año y sección da 409.
      expect(await lifecycle.ensureYearBackups(yearId)).toEqual([]);
      await expect(
        jobs.create({
          type: 'YEAR_BACKUP',
          params: { academicYearId: yearId, sectionId: sectionZ },
          requestedById: null,
        }),
      ).rejects.toMatchObject({ status: 409, response: { code: 'JOB_ALREADY_ACTIVE' } });
    });

    it('el procesador sube un ZIP por sección a backups/ y no vence (U6)', async () => {
      const rows = await prisma.backgroundJob.findMany({
        where: { academicYearId: yearId, type: 'YEAR_BACKUP' },
      });
      for (const r of rows) await backupProcessor.handle(fakeJob(r.id));
      for (const r of rows) {
        const done = await jobRow(r.id);
        expect(done).toMatchObject({ status: 'SUCCEEDED', expiresAt: null });
        expect(done.resultObjectKey).toMatch(/^backups\//);
        expect(Number(done.resultBytes)).toBeGreaterThan(0);
        expect(await exists(done.resultObjectKey!)).toBe(true);
      }
    });

    it('GET /admin/academic-years/:id/backups muestra el respaldo y la purga en espera', async () => {
      const res = await get('admin', `/admin/academic-years/${yearId}/backups`).expect(200);
      expect(res.body.academicYear).toMatchObject({ id: yearId, year: QA_YEAR });
      expect(res.body.purge).toMatchObject({
        state: 'WAITING_DEADLINE',
        purgeAfterDays,
        sectionsTotal: 2,
        sectionsBackedUp: 2,
        purgedAt: null,
        job: null,
      });
      expect(res.body.sections.map((s: { code: string }) => s.code)).toEqual(['Z', 'Y']);
      for (const s of res.body.sections) {
        expect(s.backup).toMatchObject({ status: 'SUCCEEDED', hasResult: true });
        expect(s.backup).not.toHaveProperty('resultObjectKey');
        expect(s.backup).not.toHaveProperty('params');
      }
      await get('docente01', `/admin/academic-years/${yearId}/backups`).expect(403);
      await get('admin', `/admin/academic-years/${randomUUID()}/backups`).expect(404);
    });

    it('el ADMIN descarga un respaldo con URL firmada y queda job.download', async () => {
      const res = await get('admin', `/admin/academic-years/${yearId}/backups`).expect(200);
      const backupId = res.body.sections[0].backup.id as string;
      const url = await post('admin', `/admin/jobs/${backupId}/download-url`).expect(200);
      expect(url.body.method).toBe('GET');
      const file = await fetch(url.body.url);
      expect(file.status).toBe(200);
      const bytes = Buffer.from(await file.arrayBuffer());
      expect(bytes.subarray(0, 2).toString()).toBe('PK');
      expect(bytes.includes(Buffer.from('indice.csv'))).toBe(true);
      expect(auditOf('job.download').at(-1)).toMatchObject({
        actorId: ids.get('admin'),
        entityId: backupId,
        afterState: { jobId: backupId, type: 'YEAR_BACKUP' },
      });
    });
  });

  describe('RF-66: purga del año', () => {
    it('antes del plazo, PURGE_YEAR falla sin reintentos con PURGE_NOT_ELIGIBLE y no borra', async () => {
      expect(await lifecycle.enqueuePurgeIfEligible(yearId)).toBeNull();
      // Forzado (el barrido no lo encolaría): la purga vuelve a comprobar todo.
      const forced = await jobs.create({
        type: 'PURGE_YEAR',
        params: { academicYearId: yearId },
        requestedById: null,
      });
      await expect(purgeProcessor.handle(fakeJob(forced.id))).rejects.toThrow('PURGE_NOT_ELIGIBLE');
      expect(await jobRow(forced.id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'PURGE_NOT_ELIGIBLE',
      });
      expect(await exists(fileKey)).toBe(true);
      expect(
        (await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } })).purgedAt,
      ).toBeNull();
    });

    it('cumplido el plazo, se encola una sola vez, purga y deja lifecycle.purge', async () => {
      await prisma.academicYear.update({
        where: { id: yearId },
        data: { closedAt: new Date(Date.now() - (purgeAfterDays + 1) * DAY) },
      });
      const backups = await prisma.backgroundJob.findMany({
        where: { academicYearId: yearId, type: 'YEAR_BACKUP' },
      });

      const job = await lifecycle.enqueuePurgeIfEligible(yearId);
      expect(job).toMatchObject({ type: 'PURGE_YEAR', status: 'QUEUED' });
      // Duplicado: el 409 se traga y no se crea otro.
      expect(await lifecycle.enqueuePurgeIfEligible(yearId)).toBeNull();
      await expect(
        jobs.create({
          type: 'PURGE_YEAR',
          params: { academicYearId: yearId },
          requestedById: null,
        }),
      ).rejects.toMatchObject({ status: 409 });

      await purgeProcessor.handle(fakeJob(job!.id));
      expect(await jobRow(job!.id)).toMatchObject({ status: 'SUCCEEDED' });

      expect(await exists(fileKey)).toBe(false);
      expect(
        (await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } })).purgedAt,
      ).not.toBeNull();
      for (const b of backups) {
        expect(await exists(b.resultObjectKey!)).toBe(false);
        expect(await jobRow(b.id)).toMatchObject({ status: 'EXPIRED', resultObjectKey: null });
      }
      expect(auditOf('lifecycle.purge').at(-1)).toMatchObject({
        actorId: undefined,
        module: 'lifecycle',
        entityType: 'AcademicYear',
        entityId: yearId,
        afterState: expect.objectContaining({
          jobId: job!.id,
          purged: 1,
          backupsDeleted: 2,
          excludedFromBackup: 0,
        }),
      });

      const view = await get('admin', `/admin/academic-years/${yearId}/backups`).expect(200);
      expect(view.body.purge.state).toBe('PURGED');
      expect(view.body.purge.purgedAt).not.toBeNull();
      // Ya purgado: el barrido no vuelve a encolar respaldos ni purga.
      expect(await lifecycle.sweep()).toMatchObject({ purges: 0 });
      expect(await lifecycle.ensureYearBackups(yearId)).toEqual([]);
    });
  });

  describe('RF-63: datos personales', () => {
    it('solo ADMIN, solo estudiantes; límite de 3 activos con 429 JOB_LIMIT', async () => {
      const student = ids.get('estudiante01')!;
      await post('docente01', `/admin/students/${student}/personal-data-export`).expect(403);
      await post('admin', `/admin/students/${ids.get('docente01')}/personal-data-export`).expect(
        404,
      );
      await post('admin', '/admin/students/no-es-uuid/personal-data-export').expect(400);

      const created: string[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await post('admin', `/admin/students/${student}/personal-data-export`).expect(
          202,
        );
        expect(res.body).toMatchObject({ type: 'PERSONAL_DATA_EXPORT', status: 'QUEUED' });
        created.push(res.body.id);
        extraJobIds.push(res.body.id);
      }
      const before = await prisma.backgroundJob.count();
      const limited = await post('admin', `/admin/students/${student}/personal-data-export`).expect(
        429,
      );
      expect(limited.body.error.code).toBe('JOB_LIMIT');
      expect(await prisma.backgroundJob.count()).toBe(before);
      expect(auditOf('lifecycle.personal_data_export.request').at(-1)).toMatchObject({
        actorId: ids.get('admin'),
        entityId: student,
        afterState: { jobId: created[2] },
      });
      // Sin datos personales en params ni en la bitácora.
      const row = await jobRow(created[0]);
      expect(row.params).toEqual({ studentId: student });
    });

    it('el procesador arma el JSON con contactEmail e email (opcional)', async () => {
      const student = ids.get('estudiante01')!;
      const user = await prisma.user.findUniqueOrThrow({ where: { id: student } });
      const data = await buildPersonalData(
        app.get(PrismaService, { strict: false }),
        student,
        new Date(),
      );
      expect(data?.usuario).toMatchObject({
        id: student,
        correoContacto: user.contactEmail,
        correoUsuario: user.email,
      });
      expect(Array.isArray(data?.matriculas)).toBe(true);
      expect(Array.isArray(data?.notas)).toBe(true);
      // Del apoderado solo el nombre.
      for (const g of data?.apoderados ?? []) {
        expect(Object.keys(g)).not.toContain('correoContacto');
      }
      expect(
        await buildPersonalData(
          app.get(PrismaService, { strict: false }),
          ids.get('docente01')!,
          new Date(),
        ),
      ).toBeNull();
    });

    it('el ADMIN consulta el estado y descarga el ZIP; queda job.download (Decisión 8)', async () => {
      const id = extraJobIds[0];
      const queued = await get('admin', `/admin/jobs/${id}`).expect(200);
      expect(queued.body).toMatchObject({ id, status: 'QUEUED', hasResult: false });
      await post('admin', `/admin/jobs/${id}/download-url`).expect(409);

      await exportProcessor.handle(fakeJob(id));
      const done = await get('admin', `/admin/jobs/${id}`).expect(200);
      expect(done.body).toMatchObject({ status: 'SUCCEEDED', hasResult: true });
      expect(done.body.expiresAt).not.toBeNull();

      const url = await post('admin', `/admin/jobs/${id}/download-url`).expect(200);
      const file = await fetch(url.body.url);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-disposition') ?? '').toMatch(/datos-personales/);
      const bytes = Buffer.from(await file.arrayBuffer());
      expect(bytes.subarray(0, 2).toString()).toBe('PK');
      expect(bytes.includes(Buffer.from('datos-personales.json'))).toBe(true);
      expect(auditOf('job.download').at(-1)).toMatchObject({
        actorId: ids.get('admin'),
        module: 'jobs',
        entityId: id,
        afterState: { jobId: id, type: 'PERSONAL_DATA_EXPORT' },
      });

      await get('docente01', `/admin/jobs/${id}`).expect(403);
      await get('admin', `/admin/jobs/${randomUUID()}`).expect(404);
    });
  });

  describe('RUNNING colgados (seguridad 5b, hallazgo 7)', () => {
    it('un RUNNING de más de 1 h pasa a FAILED con STALLED; uno reciente no', async () => {
      const [oldId, freshId] = extraJobIds.slice(1, 3);
      await jobs.start(oldId, new Date(Date.now() - 2 * 3_600_000));
      await jobs.start(freshId, new Date(Date.now() - 10 * 60_000));
      expect(await jobs.failStalled(new Date())).toBeGreaterThanOrEqual(1);
      expect(await jobRow(oldId)).toMatchObject({ status: 'FAILED', errorCode: 'STALLED' });
      expect(await jobRow(freshId)).toMatchObject({ status: 'RUNNING' });
      // Un worker que despierta tarde ya no puede marcarlo SUCCEEDED.
      expect(await jobs.succeed(oldId, null)).toBe(false);
    });
  });
});
