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
import { FileLifecycleService } from './../src/modules/files/file-lifecycle.service.js';
import {
  BackgroundJobService,
  buildResultKey,
  JobResultStorage,
  type StartedJob,
  type TrackedJobData,
  TrackedJobRunner,
} from './../src/modules/jobs/index.js';
import { readZip } from './../src/modules/jobs/zip-reader.mock-spec.js';
import { LifecycleService } from './../src/modules/lifecycle/lifecycle.service.js';
import {
  buildPersonalData,
  PERSONAL_DATA_FILE,
  PersonalDataExportProcessor,
} from './../src/modules/lifecycle/processors/personal-data-export.processor.js';
import { PurgeYearProcessor } from './../src/modules/lifecycle/processors/purge-year.processor.js';
import { QueueService } from './../src/modules/queue/index.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 5g de Dev 5, casos límite de JOB_LIMIT, STALLED, PURGE_YEAR (U7) y RF-63 contra MySQL y
// MinIO reales (solo local con Docker). Redis no se usa: se espía QueueService.enqueue y los
// procesadores se ejecutan a mano. Crea los años ficticios 2092 y 2093 y los borra al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const YEAR_A = 2092;
const YEAR_B = 2093;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const TITLE_PREFIX = 'QA-5G-EDGE ';
type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Status = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

const fakeJob = (backgroundJobId: string) =>
  ({ data: { backgroundJobId }, opts: { attempts: 1 }, attemptsMade: 0 }) as Job<TrackedJobData>;

describe.skipIf(!process.env.DATABASE_URL)('Ciclo de vida 5g: casos límite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let sink: MemoryAuditSink;
  let jobs: BackgroundJobService;
  let results: JobResultStorage;
  let lifecycle: LifecycleService;
  let files: FileLifecycleService;
  let exportProcessor: PersonalDataExportProcessor;
  let purgeProcessor: PurgeYearProcessor;

  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  const trackedJobIds: string[] = [];
  const objectKeys: string[] = [];
  let yearA: string;
  let yearB: string;
  let sectionZ: string;
  let sectionY: string;
  let csZ: string;
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

  /** Fila de BackgroundJob con un estado coherente con los CHECK de la BD. */
  const insertJob = async (
    type: 'YEAR_BACKUP' | 'PURGE_YEAR' | 'BULK_EXPORT' | 'SECTION_EXPORT' | 'PERSONAL_DATA_EXPORT',
    status: Status,
    opts: {
      yearId?: string;
      sectionId?: string;
      startedAt?: Date;
      requestedById?: string | null;
      createdAt?: Date;
      resultObjectKey?: string;
    } = {},
  ) => {
    const startedAt = opts.startedAt ?? (status === 'QUEUED' ? null : new Date());
    const finishedAt = status === 'SUCCEEDED' || status === 'FAILED' ? new Date() : null;
    const params: Record<string, string> = {};
    if (opts.yearId) params.academicYearId = opts.yearId;
    if (opts.sectionId) params.sectionId = opts.sectionId;
    const row = await prisma.backgroundJob.create({
      data: {
        type,
        status,
        params,
        academicYearId: opts.yearId ?? null,
        requestedById: opts.requestedById ?? null,
        startedAt,
        finishedAt,
        errorCode: status === 'FAILED' ? 'QA_FAILED' : null,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        ...(opts.resultObjectKey
          ? { resultObjectKey: opts.resultObjectKey, resultBytes: BigInt(4) }
          : {}),
      },
    });
    trackedJobIds.push(row.id);
    return row;
  };

  const resetYearJobs = async (yearId: string) => {
    await prisma.backgroundJob.deleteMany({ where: { academicYearId: yearId } });
  };

  const putObject = async (key: string, body: string) => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(body) }));
    objectKeys.push(key);
  };

  const makeFile = async (name: string) => {
    const d = new Date();
    const key = `materials/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.pdf`;
    const body = Buffer.from(`%PDF-1.4 ${name}`);
    await putObject(key, body.toString());
    const file = await prisma.storedFile.create({
      data: {
        objectKey: key,
        purpose: 'MATERIAL',
        courseSectionId: csZ,
        uploadedById: ids.get('docente01')!,
        originalName: `${TITLE_PREFIX}${name}.pdf`,
        maxBytes: 1024,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        uploadStatus: 'COMPLETED',
        scanStatus: 'CLEAN',
        intentExpiresAt: new Date(),
        completedAt: new Date(),
        scannedAt: new Date(),
      },
    });
    return { id: file.id, key, size: body.length };
  };

  const makeMaterial = (fileId: string, isReusable: boolean) =>
    prisma.material.create({
      data: {
        courseSectionId: csZ,
        kind: 'CLASS',
        title: `${TITLE_PREFIX}material`,
        fileId,
        isReusable,
        createdById: ids.get('docente01')!,
      },
    });

  const cleanYear = async (year: number) => {
    const row = await prisma.academicYear.findUnique({ where: { year } });
    if (!row) return;
    const jobsOfYear = await prisma.backgroundJob.findMany({
      where: { academicYearId: row.id },
      select: { resultObjectKey: true },
    });
    for (const j of jobsOfYear) {
      if (j.resultObjectKey) await results.delete(j.resultObjectKey).catch(() => undefined);
    }
    await prisma.backgroundJob.deleteMany({ where: { academicYearId: row.id } });
    const where = { courseSection: { section: { academicYearId: row.id } } };
    const stored = await prisma.storedFile.findMany({ where, select: { id: true } });
    await prisma.material.deleteMany({ where });
    await prisma.storedFile.deleteMany({ where: { id: { in: stored.map((f) => f.id) } } });
    await prisma.courseSection.deleteMany({ where: { section: { academicYearId: row.id } } });
    await prisma.section.deleteMany({ where: { academicYearId: row.id } });
    await prisma.academicYear.delete({ where: { id: row.id } });
  };

  const cleanJobs = async () => {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        OR: [
          { id: { in: trackedJobIds } },
          {
            requestedById: { in: [ids.get('admin')!, ids.get('docente01')!] },
            status: { in: ['QUEUED', 'RUNNING'] },
          },
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
    files = app.get(FileLifecycleService, { strict: false });
    vi.spyOn(app.get(QueueService, { strict: false }), 'enqueue').mockImplementation(
      (_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''),
    );

    const runner = app.get(TrackedJobRunner, { strict: false });
    const prismaService = app.get(PrismaService, { strict: false });
    exportProcessor = new PersonalDataExportProcessor(
      null as never,
      runner,
      prismaService,
      results,
    );
    purgeProcessor = new PurgeYearProcessor(
      null as never,
      runner,
      prismaService,
      files,
      jobs,
      lifecycle,
      app.get(AuditService, { strict: false }),
      results,
    );

    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    await cleanYear(YEAR_A);
    await cleanYear(YEAR_B);
    await cleanJobs();
    purgeAfterDays = await lifecycle.purgeAfterDays();

    yearA = (await prisma.academicYear.create({ data: { year: YEAR_A, closedAt: null } })).id;
    yearB = (await prisma.academicYear.create({ data: { year: YEAR_B, closedAt: null } })).id;
    sectionZ = (
      await prisma.section.create({ data: { academicYearId: yearA, gradeLevel: 1, code: 'Z' } })
    ).id;
    sectionY = (
      await prisma.section.create({ data: { academicYearId: yearA, gradeLevel: 2, code: 'Y' } })
    ).id;
    const course = await prisma.course.findFirstOrThrow({ orderBy: { name: 'asc' } });
    csZ = (
      await prisma.courseSection.create({ data: { sectionId: sectionZ, courseId: course.id } })
    ).id;
  });

  afterAll(async () => {
    try {
      if (results) {
        for (const key of objectKeys) await results.delete(key).catch(() => undefined);
        await cleanYear(YEAR_A);
        await cleanYear(YEAR_B);
        await cleanJobs();
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  });

  // --- JOB_LIMIT y duplicados --------------------------------------------------------------

  describe('seguridad 5b h2: JOB_LIMIT y trabajos duplicados', () => {
    const bulk = (requestedById: string | null) =>
      jobs.create({ type: 'BULK_EXPORT', params: { sectionId: 'abc' }, requestedById });

    beforeEach(async () => {
      await cleanJobs();
    });

    it('con 3 trabajos activos, el 4.º da 429 JOB_LIMIT y no crea fila', async () => {
      const admin = ids.get('admin')!;
      for (let i = 0; i < 3; i++) trackedJobIds.push((await bulk(admin)).id);
      const before = await prisma.backgroundJob.count({ where: { requestedById: admin } });
      await expect(bulk(admin)).rejects.toMatchObject({
        status: 429,
        response: { code: 'JOB_LIMIT' },
      });
      expect(await prisma.backgroundJob.count({ where: { requestedById: admin } })).toBe(before);
    });

    it('2 activos sí dejan crear el 3.º (borde justo debajo del límite)', async () => {
      const admin = ids.get('admin')!;
      trackedJobIds.push((await bulk(admin)).id, (await bulk(admin)).id);
      const third = await bulk(admin);
      trackedJobIds.push(third.id);
      expect(third.status).toBe('QUEUED');
    });

    it('RUNNING cuenta como activo; FAILED, SUCCEEDED y EXPIRED no', async () => {
      const admin = ids.get('admin')!;
      const a = await bulk(admin);
      const b = await bulk(admin);
      const c = await bulk(admin);
      trackedJobIds.push(a.id, b.id, c.id);
      await jobs.start(a.id);
      await expect(bulk(admin)).rejects.toMatchObject({ status: 429 });

      await jobs.fail(a.id, 'QA');
      const d = await bulk(admin); // ahora hay 2 activos + este = 3
      trackedJobIds.push(d.id);
      await expect(bulk(admin)).rejects.toMatchObject({ status: 429 });

      await jobs.start(b.id);
      await jobs.succeed(b.id, null);
      const e = await bulk(admin);
      trackedJobIds.push(e.id);
      await jobs.start(c.id);
      await jobs.succeed(c.id, null);
      await prisma.backgroundJob.update({
        where: { id: c.id },
        data: { status: 'EXPIRED', expiresAt: new Date() },
      });
      const f = await bulk(admin);
      trackedJobIds.push(f.id);
      expect(f.status).toBe('QUEUED');
    });

    it('el límite es por solicitante: otro usuario y el sistema (null) no lo sufren', async () => {
      const admin = ids.get('admin')!;
      for (let i = 0; i < 3; i++) trackedJobIds.push((await bulk(admin)).id);
      const teacherJob = await bulk(ids.get('docente01')!);
      trackedJobIds.push(teacherJob.id);
      for (let i = 0; i < 5; i++) trackedJobIds.push((await bulk(null)).id);
      await expect(bulk(admin)).rejects.toMatchObject({ status: 429 });
    });

    it('YEAR_BACKUP duplicado del mismo año y sección da 409; otra sección u otro año no', async () => {
      const make = (yearId: string, sectionId: string | undefined, by: string | null = null) =>
        jobs.create({
          type: 'YEAR_BACKUP',
          params: sectionId ? { academicYearId: yearId, sectionId } : { academicYearId: yearId },
          requestedById: by,
        });
      const first = await make(yearA, sectionZ);
      trackedJobIds.push(first.id);
      const before = await prisma.backgroundJob.count({ where: { academicYearId: yearA } });
      await expect(make(yearA, sectionZ)).rejects.toMatchObject({
        status: 409,
        response: { code: 'JOB_ALREADY_ACTIVE' },
      });
      // También si lo pide un ADMIN y el primero lo puso el sistema.
      await expect(make(yearA, sectionZ, ids.get('admin')!)).rejects.toMatchObject({ status: 409 });
      expect(await prisma.backgroundJob.count({ where: { academicYearId: yearA } })).toBe(before);

      trackedJobIds.push((await make(yearA, sectionY)).id); // otra sección
      trackedJobIds.push((await make(yearB, sectionZ)).id); // otro año
      // Respaldo del año completo (sin sección) no choca con los de sección.
      trackedJobIds.push((await make(yearA, undefined)).id);

      // Con el primero ya terminado (FAILED), se puede repetir.
      await jobs.fail(first.id, 'QA');
      trackedJobIds.push((await make(yearA, sectionZ)).id);
      await resetYearJobs(yearA);
      await resetYearJobs(yearB);
    });

    it('PURGE_YEAR duplicado del mismo año da 409, aunque cambie la sección; otro año no', async () => {
      const purge = (yearId: string) =>
        jobs.create({
          type: 'PURGE_YEAR',
          params: { academicYearId: yearId },
          requestedById: null,
        });
      trackedJobIds.push((await purge(yearA)).id);
      await expect(purge(yearA)).rejects.toMatchObject({
        status: 409,
        response: { code: 'JOB_ALREADY_ACTIVE' },
      });
      trackedJobIds.push((await purge(yearB)).id);
      // Un YEAR_BACKUP activo no bloquea a un PURGE_YEAR de otro tipo ni al revés.
      trackedJobIds.push(
        (
          await jobs.create({
            type: 'YEAR_BACKUP',
            params: { academicYearId: yearA, sectionId: sectionZ },
            requestedById: null,
          })
        ).id,
      );
      await resetYearJobs(yearA);
      await resetYearJobs(yearB);
    });

    it('YEAR_BACKUP y PURGE_YEAR sin academicYearId se rechazan antes de escribir', async () => {
      const before = await prisma.backgroundJob.count();
      await expect(
        jobs.create({ type: 'YEAR_BACKUP', params: { sectionId: sectionZ }, requestedById: null }),
      ).rejects.toThrow(/academicYearId/);
      await expect(
        jobs.create({ type: 'PURGE_YEAR', params: {}, requestedById: null }),
      ).rejects.toThrow(/academicYearId/);
      expect(await prisma.backgroundJob.count()).toBe(before);
    });
  });

  // --- STALLED -----------------------------------------------------------------------------

  describe('seguridad 5b h7: STALLED en el límite exacto', () => {
    // Se barre con un "ahora" lejano: así solo se tocan las filas de esta prueba.
    const NOW = new Date('2001-01-01T00:00:00.000Z');
    const startedAgo = (ms: number) => new Date(NOW.getTime() - ms);

    it('exportaciones: 1 h exacta sigue RUNNING; 1 h + 1 ms pasa a FAILED STALLED', async () => {
      const types = ['SECTION_EXPORT', 'PERSONAL_DATA_EXPORT'] as const;
      const onTime: string[] = [];
      const late: string[] = [];
      for (const type of types) {
        onTime.push((await insertJob(type, 'RUNNING', { startedAt: startedAgo(HOUR) })).id);
        late.push((await insertJob(type, 'RUNNING', { startedAt: startedAgo(HOUR + 1) })).id);
      }
      expect(await jobs.failStalled(NOW)).toBe(2);
      for (const id of onTime) expect((await jobRow(id)).status).toBe('RUNNING');
      for (const id of late) {
        expect(await jobRow(id)).toMatchObject({ status: 'FAILED', errorCode: 'STALLED' });
      }
      // Idempotente.
      expect(await jobs.failStalled(NOW)).toBe(0);
      await prisma.backgroundJob.deleteMany({ where: { id: { in: [...onTime, ...late] } } });
    });

    it('ZIP masivo: a 3 h exactas sigue RUNNING; a 3 h + 1 ms, STALLED', async () => {
      const onTime = await insertJob('BULK_EXPORT', 'RUNNING', { startedAt: startedAgo(3 * HOUR) });
      const late = await insertJob('BULK_EXPORT', 'RUNNING', {
        startedAt: startedAgo(3 * HOUR + 1),
      });
      expect(await jobs.failStalled(NOW)).toBe(1);
      expect((await jobRow(onTime.id)).status).toBe('RUNNING');
      expect(await jobRow(late.id)).toMatchObject({ status: 'FAILED', errorCode: 'STALLED' });
      await prisma.backgroundJob.deleteMany({ where: { id: { in: [onTime.id, late.id] } } });
    });

    it('respaldo y purga: a 1 h + 1 ms y a 6 h exactas siguen RUNNING; a 6 h + 1 ms, STALLED', async () => {
      const types = ['YEAR_BACKUP', 'PURGE_YEAR'] as const;
      const afterOneHour: string[] = [];
      const exactSix: string[] = [];
      const afterSix: string[] = [];
      for (const type of types) {
        const opts = { yearId: yearA };
        afterOneHour.push(
          (await insertJob(type, 'RUNNING', { ...opts, startedAt: startedAgo(HOUR + 1) })).id,
        );
        exactSix.push(
          (await insertJob(type, 'RUNNING', { ...opts, startedAt: startedAgo(6 * HOUR) })).id,
        );
        afterSix.push(
          (await insertJob(type, 'RUNNING', { ...opts, startedAt: startedAgo(6 * HOUR + 1) })).id,
        );
      }
      expect(await jobs.failStalled(NOW)).toBe(2);
      for (const id of [...afterOneHour, ...exactSix]) {
        expect((await jobRow(id)).status, id).toBe('RUNNING');
      }
      for (const id of afterSix) {
        expect(await jobRow(id)).toMatchObject({ status: 'FAILED', errorCode: 'STALLED' });
      }
      await resetYearJobs(yearA);
    });

    it('un QUEUED viejo y un RUNNING de otro tipo reciente no se tocan; el STALLED no puede resucitar', async () => {
      const queued = await insertJob('BULK_EXPORT', 'QUEUED', { startedAt: startedAgo(50 * HOUR) });
      const fresh = await insertJob('BULK_EXPORT', 'RUNNING', { startedAt: startedAgo(HOUR - 1) });
      const old = await insertJob('BULK_EXPORT', 'RUNNING', {
        startedAt: startedAgo(3 * HOUR + 1),
      });
      expect(await jobs.failStalled(NOW)).toBe(1);
      expect((await jobRow(queued.id)).status).toBe('QUEUED');
      expect((await jobRow(fresh.id)).status).toBe('RUNNING');
      expect(await jobRow(old.id)).toMatchObject({ status: 'FAILED', errorCode: 'STALLED' });
      // El worker que despierta tarde no puede dejarlo SUCCEEDED ni reiniciarlo.
      expect(await jobs.succeed(old.id, null)).toBe(false);
      expect(await jobs.start(old.id)).toBeNull();
    });
  });

  // --- PURGE_YEAR: precondiciones U7 y archivos reutilizables ---------------------------------

  describe('RF-66, U7: cada precondición de la purga por separado', () => {
    let stored: { id: string; key: string; size: number };
    const closedLongAgo = () => new Date(Date.now() - (purgeAfterDays + 1) * DAY);

    const backupsDone = async () => {
      await resetYearJobs(yearA);
      for (const sectionId of [sectionZ, sectionY]) {
        await insertJob('YEAR_BACKUP', 'SUCCEEDED', { yearId: yearA, sectionId });
      }
    };
    const queuePurge = async () => {
      const job = await jobs.create({
        type: 'PURGE_YEAR',
        params: { academicYearId: yearA },
        requestedById: null,
      });
      trackedJobIds.push(job.id);
      return job;
    };
    /** La purga falla sin reintentos y no toca archivos, respaldos ni bitácora. */
    const expectRefused = async (expectedState: string) => {
      const auditBefore = auditOf('lifecycle.purge').length;
      const status = await lifecycle.purgeStatusOf(yearA);
      expect(status?.state).toBe(expectedState);
      const job = await queuePurge();
      await expect(purgeProcessor.handle(fakeJob(job.id))).rejects.toThrow('PURGE_NOT_ELIGIBLE');
      expect(await jobRow(job.id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'PURGE_NOT_ELIGIBLE',
        attempts: 1,
      });
      expect(await exists(stored.key)).toBe(true);
      expect(
        (await prisma.storedFile.findUniqueOrThrow({ where: { id: stored.id } })).purgedAt,
      ).toBeNull();
      expect(
        await prisma.backgroundJob.count({
          where: { academicYearId: yearA, type: 'YEAR_BACKUP', status: 'EXPIRED' },
        }),
      ).toBe(0);
      expect(auditOf('lifecycle.purge')).toHaveLength(auditBefore);
      // Tampoco el barrido la encola.
      expect(await lifecycle.enqueuePurgeIfEligible(yearA)).toBeNull();
    };

    beforeAll(async () => {
      stored = await makeFile('purga-base');
    });

    it('año abierto: NOT_CLOSED aunque haya respaldos y el plazo "sobre"', async () => {
      await prisma.academicYear.update({ where: { id: yearA }, data: { closedAt: null } });
      await backupsDone();
      await expectRefused('NOT_CLOSED');
    });

    it('respaldo FAILED: la sección con el último respaldo fallido bloquea la purga', async () => {
      await prisma.academicYear.update({
        where: { id: yearA },
        data: { closedAt: closedLongAgo() },
      });
      await resetYearJobs(yearA);
      const old = new Date(Date.now() - 2 * HOUR);
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', { yearId: yearA, sectionId: sectionZ });
      // Y: primero uno bueno y después uno fallido, que es el vigente.
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', {
        yearId: yearA,
        sectionId: sectionY,
        createdAt: old,
      });
      await insertJob('YEAR_BACKUP', 'FAILED', { yearId: yearA, sectionId: sectionY });
      await expectRefused('WAITING_BACKUPS');
    });

    it('respaldo ausente, en cola o en curso también bloquea la purga', async () => {
      await prisma.academicYear.update({
        where: { id: yearA },
        data: { closedAt: closedLongAgo() },
      });
      await resetYearJobs(yearA);
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', { yearId: yearA, sectionId: sectionZ });
      await expectRefused('WAITING_BACKUPS'); // Y sin respaldo
      await insertJob('YEAR_BACKUP', 'QUEUED', { yearId: yearA, sectionId: sectionY });
      await expectRefused('WAITING_BACKUPS');
      await resetYearJobs(yearA);
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', { yearId: yearA, sectionId: sectionZ });
      await insertJob('YEAR_BACKUP', 'RUNNING', { yearId: yearA, sectionId: sectionY });
      await expectRefused('WAITING_BACKUPS');
    });

    it('plazo no cumplido: WAITING_DEADLINE un milisegundo antes y ELIGIBLE justo en el plazo', async () => {
      const closedAt = new Date(Math.floor(Date.now() / 1000) * 1000 - 10 * DAY);
      await prisma.academicYear.update({ where: { id: yearA }, data: { closedAt } });
      await backupsDone();
      const eligibleAt = closedAt.getTime() + purgeAfterDays * DAY;
      expect((await lifecycle.purgeStatusOf(yearA, new Date(eligibleAt - 1)))?.state).toBe(
        'WAITING_DEADLINE',
      );
      expect((await lifecycle.purgeStatusOf(yearA, new Date(eligibleAt)))?.state).toBe('ELIGIBLE');
      expect((await lifecycle.purgeStatusOf(yearA, new Date(eligibleAt + 1)))?.state).toBe(
        'ELIGIBLE',
      );

      // El procesador usa su propio "ahora": con el plazo corriendo (hoy) falla.
      const started: StartedJob = {
        id: randomUUID(),
        type: 'PURGE_YEAR',
        params: { academicYearId: yearA },
        attempts: 1,
      };
      await expect(purgeProcessor.work(started, new Date(eligibleAt - 1))).rejects.toMatchObject({
        code: 'PURGE_NOT_ELIGIBLE',
        retryable: false,
      });
      await expectRefused('WAITING_DEADLINE');
    });

    it('un año inexistente falla con YEAR_NOT_FOUND sin reintentos', async () => {
      const started: StartedJob = {
        id: randomUUID(),
        type: 'PURGE_YEAR',
        params: { academicYearId: randomUUID() },
        attempts: 1,
      };
      await expect(purgeProcessor.work(started)).rejects.toMatchObject({
        code: 'YEAR_NOT_FOUND',
        retryable: false,
      });
      await expect(purgeProcessor.work({ ...started, params: {} })).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
        retryable: false,
      });
    });

    it('seguridad 5g: un respaldo SUCCEEDED que ya no está en S3 bloquea la purga', async () => {
      await prisma.academicYear.update({
        where: { id: yearA },
        data: { closedAt: closedLongAgo() },
      });
      await resetYearJobs(yearA);
      const present = buildResultKey('zip');
      await putObject(present, 'PK-ok');
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', {
        yearId: yearA,
        sectionId: sectionZ,
        resultObjectKey: present,
      });
      // Clave registrada pero el objeto nunca se subió (borrado a mano o bucket con regla).
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', {
        yearId: yearA,
        sectionId: sectionY,
        resultObjectKey: buildResultKey('zip'),
      });
      // La política (sin S3) lo ve ELIGIBLE; la purga comprueba S3 y se niega sin tocar nada.
      expect((await lifecycle.purgeStatusOf(yearA))?.state).toBe('ELIGIBLE');
      const job = await queuePurge();
      await expect(purgeProcessor.handle(fakeJob(job.id))).rejects.toThrow('PURGE_NOT_ELIGIBLE');
      expect(await jobRow(job.id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'PURGE_NOT_ELIGIBLE',
      });
      expect(await exists(present)).toBe(true);
      expect(await exists(stored.key)).toBe(true);
      expect(
        await prisma.backgroundJob.count({
          where: { academicYearId: yearA, type: 'YEAR_BACKUP', status: 'EXPIRED' },
        }),
      ).toBe(0);
    });

    it('con todo cumplido purga, pero los archivos isReusable se conservan (RN-14)', async () => {
      await prisma.academicYear.update({
        where: { id: yearA },
        data: { closedAt: closedLongAgo() },
      });
      await resetYearJobs(yearA);
      const backupKey = buildResultKey('zip');
      await putObject(backupKey, 'PK-respaldo');
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', {
        yearId: yearA,
        sectionId: sectionZ,
        resultObjectKey: backupKey,
      });
      // Seguridad 5g: cada respaldo debe existir en S3 con más de 0 bytes.
      const backupKeyY = buildResultKey('zip');
      await putObject(backupKeyY, 'PK-respaldo-y');
      await insertJob('YEAR_BACKUP', 'SUCCEEDED', {
        yearId: yearA,
        sectionId: sectionY,
        resultObjectKey: backupKeyY,
      });

      const reusable = await makeFile('reutilizable');
      const plain = await makeFile('con-material-no-reutilizable');
      await makeMaterial(reusable.id, true);
      await makeMaterial(plain.id, false);

      expect(await files.purge(reusable.id, null)).toBe('SKIPPED_REUSABLE');
      const job = await queuePurge();
      await purgeProcessor.handle(fakeJob(job.id));
      expect(await jobRow(job.id)).toMatchObject({ status: 'SUCCEEDED' });

      // Purgados: el archivo base y el del material no reutilizable.
      for (const f of [stored, plain]) {
        expect(await exists(f.key), f.key).toBe(false);
        expect(
          (await prisma.storedFile.findUniqueOrThrow({ where: { id: f.id } })).purgedAt,
        ).not.toBeNull();
      }
      // El reutilizable sigue en MinIO y sin purgedAt.
      expect(await exists(reusable.key)).toBe(true);
      expect(
        (await prisma.storedFile.findUniqueOrThrow({ where: { id: reusable.id } })).purgedAt,
      ).toBeNull();
      // El respaldo sí se borra (U6).
      expect(await exists(backupKey)).toBe(false);
      expect(auditOf('lifecycle.purge').at(-1)).toMatchObject({
        entityId: yearA,
        afterState: expect.objectContaining({ purged: 2, skippedReusable: 1, backupsDeleted: 2 }),
      });

      // El reutilizable sigue contando en el uso del almacenamiento (RF-67); lo purgado no.
      const usage = await get('admin', `/admin/storage-usage?academicYearId=${yearA}`).expect(200);
      expect(usage.body.total).toEqual({ bytes: reusable.size, files: 1 });

      // Ya purgado: otra purga no es elegible y el reutilizable sigue intacto.
      expect((await lifecycle.purgeStatusOf(yearA))?.state).toBe('PURGED');
      await resetPurgeJobs();
      const again = await queuePurge();
      await expect(purgeProcessor.handle(fakeJob(again.id))).rejects.toThrow('PURGE_NOT_ELIGIBLE');
      expect(await exists(reusable.key)).toBe(true);
    });

    /** Deja solo el PURGE_YEAR SUCCEEDED anterior para poder encolar otro. */
    async function resetPurgeJobs() {
      await prisma.backgroundJob.deleteMany({
        where: { academicYearId: yearA, type: 'PURGE_YEAR', status: { in: ['QUEUED', 'RUNNING'] } },
      });
    }
  });

  // --- RF-63 -------------------------------------------------------------------------------

  describe('RF-63: datos personales', () => {
    it('solo ADMIN: docente, apoderado y el propio estudiante reciben 403 y no se crea nada', async () => {
      const student = ids.get('estudiante01')!;
      const before = await prisma.backgroundJob.count({ where: { type: 'PERSONAL_DATA_EXPORT' } });
      for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
        const res = await post(key, `/admin/students/${student}/personal-data-export`).expect(403);
        expect(res.body).not.toHaveProperty('id');
      }
      await post(null, `/admin/students/${student}/personal-data-export`).expect(401);
      expect(await prisma.backgroundJob.count({ where: { type: 'PERSONAL_DATA_EXPORT' } })).toBe(
        before,
      );
    });

    it('un apoderado no pide los datos de su pupilo ni un docente los de un estudiante', async () => {
      const link = await prisma.guardianStudent.findFirst({
        where: { guardianId: ids.get('apoderado01'), isActive: true },
      });
      const student = link?.studentId ?? ids.get('estudiante01')!;
      await post('apoderado01', `/admin/students/${student}/personal-data-export`).expect(403);
      await post('docente01', `/admin/students/${student}/personal-data-export`).expect(403);
    });

    it('estado y descarga son solo del ADMIN; job.download queda en la bitácora solo si se firmó', async () => {
      await cleanJobs();
      const student = ids.get('estudiante01')!;
      const created = await post('admin', `/admin/students/${student}/personal-data-export`).expect(
        202,
      );
      const id = created.body.id as string;
      trackedJobIds.push(id);

      for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
        await get(key, `/admin/jobs/${id}`).expect(403);
        await post(key, `/admin/jobs/${id}/download-url`).expect(403);
      }
      await get(null, `/admin/jobs/${id}`).expect(401);

      // Sin firmar nada no hay descarga registrada: aún no está listo (409), no existe (404).
      const downloads = () => auditOf('job.download').length;
      const base = downloads();
      await post('admin', `/admin/jobs/${id}/download-url`).expect(409);
      await post('admin', `/admin/jobs/${randomUUID()}/download-url`).expect(404);
      await post('docente01', `/admin/jobs/${id}/download-url`).expect(403);
      expect(downloads()).toBe(base);

      await exportProcessor.handle(fakeJob(id));
      const signed = await post('admin', `/admin/jobs/${id}/download-url`).expect(200);
      expect(downloads()).toBe(base + 1);
      expect(auditOf('job.download').at(-1)).toMatchObject({
        actorId: ids.get('admin'),
        module: 'jobs',
        action: 'job.download',
        entityType: 'BackgroundJob',
        entityId: id,
        afterState: { jobId: id, type: 'PERSONAL_DATA_EXPORT' },
      });
      // La bitácora no guarda la URL firmada ni el contenido.
      expect(JSON.stringify(auditOf('job.download').at(-1))).not.toContain('X-Amz');

      // Cada descarga firmada deja su propio registro.
      await post('admin', `/admin/jobs/${id}/download-url`).expect(200);
      expect(downloads()).toBe(base + 2);

      // El resultado del trabajo se descarga y es un ZIP con el JSON.
      const file = await fetch(signed.body.url);
      expect(file.status).toBe(200);
      const zip = readZip(Buffer.from(await file.arrayBuffer()));
      expect([...zip.keys()]).toEqual([PERSONAL_DATA_FILE]);
    });

    it('el JSON es solo del estudiante pedido: sin otros alumnos, apoderados ajenos ni secretos', async () => {
      const student = ids.get('estudiante01')!;
      const other = await prisma.user.findFirstOrThrow({
        where: { role: 'STUDENT', id: { not: student } },
      });
      const ownGuardians = await prisma.guardianStudent.findMany({
        where: { studentId: student },
        select: { guardianId: true },
      });
      const foreignGuardian = await prisma.guardianStudent.findFirst({
        where: {
          studentId: other.id,
          guardianId: { notIn: ownGuardians.map((g) => g.guardianId) },
        },
        select: { guardian: { select: { id: true, fullName: true, contactEmail: true } } },
      });

      const data = await buildPersonalData(
        app.get(PrismaService, { strict: false }),
        student,
        new Date(),
      );
      expect(data).not.toBeNull();
      const text = JSON.stringify(data);

      expect(data!.usuario.id).toBe(student);
      for (const forbidden of [
        other.id,
        other.fullName,
        other.institutionalEmail,
        other.contactEmail,
        other.code,
      ]) {
        if (forbidden) expect(text, forbidden).not.toContain(forbidden);
      }
      if (foreignGuardian) {
        expect(text).not.toContain(foreignGuardian.guardian.id);
        expect(text).not.toContain(foreignGuardian.guardian.fullName);
      }

      // Notas y entregas: exactamente las del estudiante.
      const grades = await prisma.grade.findMany({
        where: { enrollment: { studentId: student } },
        select: { assignmentId: true },
      });
      expect(data!.notas).toHaveLength(grades.length);
      expect(new Set(data!.notas.map((n) => n.tareaId))).toEqual(
        new Set(grades.map((g) => g.assignmentId)),
      );
      const versions = await prisma.submissionVersion.count({
        where: { submission: { enrollment: { studentId: student } } },
      });
      expect(data!.entregas).toHaveLength(versions);
      const enrollments = await prisma.enrollment.count({ where: { studentId: student } });
      expect(data!.matriculas).toHaveLength(enrollments);

      // Del apoderado solo el nombre y el estado del vínculo.
      for (const g of data!.apoderados) {
        expect(Object.keys(g).sort()).toEqual(
          ['desde', 'nombreCompleto', 'revocadoEn', 'vigente', 'vinculoId'].sort(),
        );
      }
      expect(data!.apoderados).toHaveLength(ownGuardians.length);

      // Ningún secreto en ninguna profundidad.
      const keys = new Set<string>();
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            keys.add(k);
            walk(x);
          }
        }
      };
      walk(data);
      for (const secret of [
        'passwordHash',
        'localCredential',
        'totpSecretEncrypted',
        'dniEncrypted',
        'dni',
        'phone',
        'address',
      ]) {
        expect(keys.has(secret), secret).toBe(false);
      }
    });

    it('un id que no es de un estudiante no genera datos (null) ni siquiera para el ADMIN', async () => {
      const prismaService = app.get(PrismaService, { strict: false });
      expect(await buildPersonalData(prismaService, ids.get('admin')!, new Date())).toBeNull();
      expect(
        await buildPersonalData(prismaService, ids.get('apoderado01')!, new Date()),
      ).toBeNull();
      expect(await buildPersonalData(prismaService, randomUUID(), new Date())).toBeNull();
    });
  });
});
