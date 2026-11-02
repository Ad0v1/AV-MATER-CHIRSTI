import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication, GoneException, NotFoundException } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import { App } from 'supertest/types.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  BackgroundJobService,
  buildResultKey,
  JobResultStorage,
} from './../src/modules/jobs/index.js';
import { QueueService } from './../src/modules/queue/index.js';
import { createDbTestApp } from './helpers.js';

// Fase 5b de Dev 5 (RNF-19, U6): ciclo real de BackgroundJob contra los CHECK de MySQL y descarga
// 410 tras EXPIRED. MySQL y MinIO reales (solo local con Docker). Redis no se usa: se espia
// QueueService.enqueue. Las filas y los objetos creados se borran al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const owner = { id: randomUUID(), role: 'TEACHER' as const };
const other = { id: randomUUID(), role: 'TEACHER' as const };
const admin = { id: randomUUID(), role: 'ADMIN' as const };
const DAY = 24 * 3600 * 1000;

describe.skipIf(!process.env.DATABASE_URL)('BackgroundJob (e2e, MySQL + MinIO)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jobs: BackgroundJobService;
  let results: JobResultStorage;
  let queues: QueueService;
  let enqueue: ReturnType<typeof vi.spyOn>;
  const jobIds: string[] = [];
  const keys: string[] = [];

  const mk = async (type: 'SECTION_EXPORT' | 'BULK_EXPORT' = 'BULK_EXPORT') => {
    const view = await jobs.create({ type, params: { sectionId: 'abc' }, requestedById: owner.id });
    jobIds.push(view.id);
    return view;
  };
  const row = (id: string) => prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
  const insertRaw = (data: Record<string, unknown>) =>
    prisma.backgroundJob.create({
      data: { type: 'BULK_EXPORT', params: {}, ...data } as never,
    });
  /** Inserta una fila con un estado dado; el CHECK decide si la acepta. */
  const tryInsert = async (data: Record<string, unknown>) => {
    try {
      const created = await insertRaw(data);
      jobIds.push(created.id);
      return null;
    } catch (error) {
      return error;
    }
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    app = await createDbTestApp();
    jobs = app.get(BackgroundJobService);
    results = app.get(JobResultStorage, { strict: false });
    queues = app.get(QueueService);
    enqueue = vi
      .spyOn(queues, 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));
  });

  afterAll(async () => {
    if (!app) return;
    for (const key of keys) await results.delete(key).catch(() => undefined);
    await prisma.backgroundJob.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('RNF-19: create deja la fila QUEUED y encola con jobId = id de la fila', async () => {
    const view = await mk('SECTION_EXPORT');
    expect(view).toMatchObject({ status: 'QUEUED', type: 'SECTION_EXPORT', hasResult: false });
    const r = await row(view.id);
    expect(r).toMatchObject({ status: 'QUEUED', attempts: 0, requestedById: owner.id });
    expect(r.params).toEqual({ sectionId: 'abc' });
    expect(enqueue).toHaveBeenCalledWith(
      'exports',
      'section-export',
      { backgroundJobId: view.id },
      { jobId: view.id },
    );
  });

  it('RNF-09: params con un correo se rechazan antes de escribir la fila', async () => {
    const before = await prisma.backgroundJob.count();
    await expect(
      jobs.create({ type: 'BULK_EXPORT', params: { to: 'ana@colegio.pe' }, requestedById: null }),
    ).rejects.toThrow();
    expect(await prisma.backgroundJob.count()).toBe(before);
  });

  it('RNF-19: sin Redis la fila pasa a FAILED/QUEUE_UNAVAILABLE y se responde 503', async () => {
    enqueue.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const before = await prisma.backgroundJob.findMany({ select: { id: true } });
    await expect(
      jobs.create({ type: 'BULK_EXPORT', params: {}, requestedById: owner.id }),
    ).rejects.toMatchObject({ response: { code: 'QUEUE_UNAVAILABLE' } });
    const after = await prisma.backgroundJob.findMany({
      where: { id: { notIn: before.map((b) => b.id) } },
    });
    expect(after).toHaveLength(1);
    jobIds.push(after[0].id);
    expect(after[0]).toMatchObject({ status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE' });
    expect(after[0].finishedAt).not.toBeNull();
  });

  it('RNF-19: QUEUED -> RUNNING -> reintento -> SUCCEEDED respeta los CHECK', async () => {
    const view = await mk();
    const t0 = new Date();
    const first = await jobs.start(view.id, t0);
    expect(first).toMatchObject({ id: view.id, attempts: 1, params: { sectionId: 'abc' } });
    expect(await row(view.id)).toMatchObject({ status: 'RUNNING', attempts: 1 });

    // Reintento: RUNNING -> RUNNING suma un intento.
    expect(await jobs.start(view.id, new Date())).toMatchObject({ attempts: 2 });

    // No se puede pasar a SUCCEEDED desde QUEUED: otra fila QUEUED no cambia.
    const queued = await mk();
    expect(await jobs.succeed(queued.id, null)).toBe(false);
    expect(await row(queued.id)).toMatchObject({ status: 'QUEUED' });

    const key = buildResultKey('json');
    keys.push(key);
    const bytes = await results.upload(key, Buffer.from('{"ok":true}'));
    const now = new Date();
    expect(await jobs.succeed(view.id, { objectKey: key, bytes }, now)).toBe(true);
    const done = await row(view.id);
    expect(done).toMatchObject({ status: 'SUCCEEDED', errorCode: null, resultObjectKey: key });
    expect(Number(done.resultBytes)).toBe(11);
    expect(done.finishedAt).not.toBeNull();
    // TTL de 7 dias (EXPORT_TTL_DAYS por defecto, U6).
    expect(done.expiresAt!.getTime() - now.getTime()).toBe(7 * DAY);

    // Terminado: ni start ni fail ni un segundo succeed lo tocan.
    expect(await jobs.start(view.id)).toBeNull();
    expect(await jobs.fail(view.id, 'X')).toBe(false);
    expect(await jobs.succeed(view.id, null)).toBe(false);
    expect((await row(view.id)).status).toBe('SUCCEEDED');
  });

  it('RNF-19: FAILED guarda un codigo estable y desde QUEUED tambien se puede fallar', async () => {
    const running = await mk();
    await jobs.start(running.id);
    expect(await jobs.fail(running.id, 'select * from User')).toBe(true);
    expect(await row(running.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'INTERNAL_ERROR',
    });
    expect(await jobs.start(running.id)).toBeNull();

    const queued = await mk();
    expect(await jobs.fail(queued.id, 'GOTENBERG_TIMEOUT')).toBe(true);
    expect(await row(queued.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'GOTENBERG_TIMEOUT',
    });
  });

  it('RN-12: solo el solicitante o un ADMIN ven el trabajo; otro usuario recibe 404', async () => {
    const view = await mk();
    await expect(jobs.findForActor(view.id, owner)).resolves.toMatchObject({ id: view.id });
    await expect(jobs.findForActor(view.id, admin)).resolves.toMatchObject({ id: view.id });
    await expect(jobs.findForActor(view.id, other)).rejects.toBeInstanceOf(NotFoundException);
    await expect(jobs.findForActor(randomUUID(), admin)).rejects.toBeInstanceOf(NotFoundException);
    const json = JSON.stringify(await jobs.findForActor(view.id, owner));
    expect(json).not.toMatch(/params|resultObjectKey|sectionId/);
  });

  it('U6: SUCCEEDED vencido -> EXPIRED, borra el objeto y la descarga da 410', async () => {
    const view = await mk();
    await jobs.start(view.id);
    const key = buildResultKey('xlsx');
    keys.push(key);
    const bytes = await results.upload(key, Buffer.from('PK-fake'));
    await jobs.succeed(view.id, { objectKey: key, bytes });

    // Antes de vencer: URL firmada que descarga el objeto.
    const signed = await jobs.createDownloadUrl(view.id, owner, 'Reporte de notas');
    expect(signed.method).toBe('GET');
    const ok = await fetch(signed.url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('PK-fake');
    expect(ok.headers.get('content-disposition')).toContain('Reporte de notas.xlsx');

    // Otro usuario no recibe URL.
    await expect(jobs.createDownloadUrl(view.id, other, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // Vence: se adelanta expiresAt y corre el barrido real.
    await prisma.backgroundJob.update({
      where: { id: view.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(jobs.createDownloadUrl(view.id, owner, 'x')).rejects.toBeInstanceOf(GoneException);
    expect(await jobs.expireResults(new Date())).toBeGreaterThanOrEqual(1);
    const expired = await row(view.id);
    expect(expired).toMatchObject({
      status: 'EXPIRED',
      resultObjectKey: null,
      resultBytes: null,
      errorCode: null,
    });
    await expect(jobs.createDownloadUrl(view.id, owner, 'x')).rejects.toMatchObject({
      response: { code: 'JOB_EXPIRED' },
    });
    // El objeto ya no existe en MinIO (la URL anterior ya no lo entrega).
    expect((await fetch(signed.url)).status).toBe(404);
    // Idempotente: otra corrida no lo vuelve a contar y EXPIRED no vuelve atras.
    await jobs.expireResults(new Date());
    expect((await row(view.id)).status).toBe('EXPIRED');
    expect(await jobs.start(view.id)).toBeNull();
    expect(await jobs.fail(view.id, 'X')).toBe(false);
  });

  it('descarga: 409 si esta QUEUED, RUNNING o FAILED', async () => {
    const view = await mk();
    await expect(jobs.createDownloadUrl(view.id, owner, 'x')).rejects.toMatchObject({
      response: { code: 'JOB_NOT_READY' },
    });
    await jobs.start(view.id);
    await expect(jobs.createDownloadUrl(view.id, owner, 'x')).rejects.toMatchObject({
      response: { code: 'JOB_NOT_READY' },
    });
    await jobs.fail(view.id, 'X');
    await expect(jobs.createDownloadUrl(view.id, owner, 'x')).rejects.toMatchObject({
      response: { code: 'JOB_NOT_READY' },
    });
  });

  describe('CHECK de BackgroundJob (rechazan estados incoherentes)', () => {
    const t = new Date('2026-10-30T10:00:00.000Z');
    const later = new Date('2026-10-30T11:00:00.000Z');

    it.each([
      ['QUEUED con finishedAt', { status: 'QUEUED', finishedAt: later }],
      ['RUNNING sin startedAt', { status: 'RUNNING' }],
      ['RUNNING con finishedAt', { status: 'RUNNING', startedAt: t, finishedAt: later }],
      ['SUCCEEDED sin finishedAt', { status: 'SUCCEEDED', startedAt: t }],
      [
        'SUCCEEDED con errorCode',
        { status: 'SUCCEEDED', startedAt: t, finishedAt: later, errorCode: 'X' },
      ],
      ['FAILED sin errorCode', { status: 'FAILED', startedAt: t, finishedAt: later }],
      ['EXPIRED sin expiresAt', { status: 'EXPIRED', startedAt: t, finishedAt: later }],
      [
        'finishedAt anterior a startedAt',
        { status: 'FAILED', startedAt: later, finishedAt: t, errorCode: 'X' },
      ],
      [
        'QUEUED con resultObjectKey',
        { status: 'QUEUED', resultObjectKey: 'exports/2026/10/x.json' },
      ],
      [
        'resultBytes sin clave',
        { status: 'SUCCEEDED', startedAt: t, finishedAt: later, resultBytes: 5n },
      ],
      ['QUEUED con expiresAt', { status: 'QUEUED', expiresAt: later }],
      ['attempts negativo', { attempts: -1 }],
    ])('rechaza: %s', async (_name, data) => {
      expect(await tryInsert(data)).not.toBeNull();
    });

    it('rechaza params que no es un objeto JSON', async () => {
      expect(await tryInsert({ params: [] })).not.toBeNull();
      expect(await tryInsert({ params: 'texto' })).not.toBeNull();
    });

    it('acepta los estados coherentes del ciclo', async () => {
      expect(await tryInsert({ status: 'QUEUED' })).toBeNull();
      expect(await tryInsert({ status: 'RUNNING', startedAt: t, attempts: 2 })).toBeNull();
      expect(
        await tryInsert({ status: 'SUCCEEDED', startedAt: t, finishedAt: later, expiresAt: later }),
      ).toBeNull();
      expect(
        await tryInsert({ status: 'FAILED', startedAt: t, finishedAt: later, errorCode: 'X' }),
      ).toBeNull();
      expect(
        await tryInsert({ status: 'FAILED', finishedAt: later, errorCode: 'QUEUE_UNAVAILABLE' }),
      ).toBeNull();
      expect(
        await tryInsert({ status: 'EXPIRED', startedAt: t, finishedAt: later, expiresAt: later }),
      ).toBeNull();
    });
  });
});
