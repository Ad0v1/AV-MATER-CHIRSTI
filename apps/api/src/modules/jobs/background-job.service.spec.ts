import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.js';
import type { QueueService } from '../queue/index.js';
import { BackgroundJobService, sanitizeErrorCode } from './background-job.service.js';
import type { JobResultStorage } from './job-result.storage.js';

const ID = '0192f0c4-0000-7000-8000-000000000001';
const YEAR = '0192f0c4-0000-7000-8000-0000000000a1';
const owner = { id: 'u1', role: 'TEACHER' as const };
const admin = { id: 'adm', role: 'ADMIN' as const };
const other = { id: 'u2', role: 'TEACHER' as const };
const NOW = new Date('2026-10-30T12:00:00Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    type: 'SECTION_EXPORT',
    status: 'QUEUED',
    requestedById: 'u1',
    resultObjectKey: null,
    resultBytes: null,
    errorCode: null,
    createdAt: NOW,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
    ...over,
  };
}

function setup() {
  const db = {
    create: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(row({ type: args.data.type })),
    ),
    findUnique: vi.fn(() => Promise.resolve(row() as Record<string, unknown> | null)),
    findMany: vi.fn(() =>
      Promise.resolve([] as Array<{ id: string; resultObjectKey: string | null }>),
    ),
    updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };
  const prisma = { backgroundJob: db } as unknown as PrismaService;
  const queues = { enqueue: vi.fn(() => Promise.resolve(ID)) };
  const results = {
    createDownloadUrl: vi.fn(() =>
      Promise.resolve({ url: 'https://s3/x', method: 'GET', headers: {}, expiresAt: '' }),
    ),
    delete: vi.fn(() => Promise.resolve()),
  };
  const env = { EXPORT_TTL_DAYS: 7 } as Env;
  const service = new BackgroundJobService(
    prisma,
    queues as unknown as QueueService,
    results as unknown as JobResultStorage,
    env,
  );
  return { db, queues, results, service };
}

describe('BackgroundJobService.create', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('crea la fila QUEUED y encola en la cola del tipo con jobId = id de la fila', async () => {
    const view = await s.service.create({
      type: 'SECTION_EXPORT',
      params: { courseSectionId: 'cs1' },
      requestedById: 'u1',
    });
    expect(view).toMatchObject({ id: ID, status: 'QUEUED', hasResult: false });
    expect(s.queues.enqueue).toHaveBeenCalledWith(
      'exports',
      'section-export',
      { backgroundJobId: ID },
      { jobId: ID },
    );
  });

  it('copia academicYearId de params en YEAR_BACKUP y lo exige', async () => {
    await s.service.create({
      type: 'YEAR_BACKUP',
      params: { academicYearId: YEAR },
      requestedById: null,
    });
    expect(s.db.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ academicYearId: YEAR }) }),
    );
    expect(s.queues.enqueue).toHaveBeenCalledWith(
      'lifecycle',
      'year-backup',
      expect.anything(),
      expect.anything(),
    );
    await expect(
      s.service.create({ type: 'PURGE_YEAR', params: {}, requestedById: 'adm' }),
    ).rejects.toThrow(/academicYearId/);
  });

  it('si Redis no responde, marca FAILED QUEUE_UNAVAILABLE y responde 503', async () => {
    s.queues.enqueue.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      s.service.create({ type: 'BULK_EXPORT', params: {}, requestedById: 'adm' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(s.db.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: { in: ['QUEUED', 'RUNNING'] } },
      data: expect.objectContaining({ status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE' }),
    });
  });

  it('rechaza params con datos personales antes de escribir', async () => {
    await expect(
      s.service.create({ type: 'BULK_EXPORT', params: { email: 'a@b.pe' }, requestedById: 'adm' }),
    ).rejects.toThrow();
    expect(s.db.create).not.toHaveBeenCalled();
  });
});

describe('BackgroundJobService lectura y descarga', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('el solicitante y ADMIN lo ven; otro usuario recibe 404', async () => {
    await expect(s.service.findForActor(ID, owner)).resolves.toMatchObject({ id: ID });
    await expect(s.service.findForActor(ID, admin)).resolves.toMatchObject({ id: ID });
    await expect(s.service.findForActor(ID, other)).rejects.toBeInstanceOf(NotFoundException);
    s.db.findUnique.mockResolvedValueOnce(null);
    await expect(s.service.findForActor(ID, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('la vista no expone params ni la clave del objeto y convierte BigInt', async () => {
    s.db.findUnique.mockResolvedValueOnce(
      row({
        status: 'SUCCEEDED',
        resultObjectKey: 'exports/k',
        resultBytes: 10n,
        startedAt: NOW,
        finishedAt: NOW,
      }),
    );
    const view = await s.service.findForActor(ID, owner);
    expect(view.resultBytes).toBe(10);
    expect(view.hasResult).toBe(true);
    expect(JSON.stringify(view)).not.toContain('exports/');
  });

  it('descarga: 409 si no termino, 410 si vencio y URL firmada si SUCCEEDED', async () => {
    await expect(s.service.createDownloadUrl(ID, owner, 'r', NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );

    s.db.findUnique.mockResolvedValueOnce(
      row({ status: 'EXPIRED', expiresAt: NOW, finishedAt: NOW }),
    );
    await expect(s.service.createDownloadUrl(ID, owner, 'r', NOW)).rejects.toBeInstanceOf(
      GoneException,
    );

    s.db.findUnique.mockResolvedValueOnce(
      row({
        status: 'SUCCEEDED',
        resultObjectKey: 'exports/k',
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    );
    await expect(s.service.createDownloadUrl(ID, owner, 'r', NOW)).rejects.toBeInstanceOf(
      GoneException,
    );

    s.db.findUnique.mockResolvedValueOnce(
      row({
        status: 'SUCCEEDED',
        resultObjectKey: 'exports/k',
        expiresAt: new Date(NOW.getTime() + 1000),
      }),
    );
    await expect(s.service.createDownloadUrl(ID, owner, 'notas', NOW)).resolves.toMatchObject({
      method: 'GET',
    });
    expect(s.results.createDownloadUrl).toHaveBeenCalledWith('exports/k', 'notas');
  });

  it('descarga ajena: 404 sin firmar', async () => {
    await expect(s.service.createDownloadUrl(ID, other, 'r', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(s.results.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('BackgroundJobService transiciones (CHECK BackgroundJob_status_chk)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('start: QUEUED|RUNNING -> RUNNING con startedAt e intento; null si ya termino', async () => {
    s.db.findUnique.mockResolvedValueOnce({
      id: ID,
      type: 'BULK_EXPORT',
      params: { a: 'x' },
      attempts: 1,
    });
    await expect(s.service.start(ID, NOW)).resolves.toEqual({
      id: ID,
      type: 'BULK_EXPORT',
      params: { a: 'x' },
      attempts: 1,
    });
    expect(s.db.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt: NOW, attempts: { increment: 1 } },
    });
    s.db.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(s.service.start(ID, NOW)).resolves.toBeNull();
  });

  it('succeed: solo desde RUNNING; con resultado vence a los EXPORT_TTL_DAYS', async () => {
    await s.service.succeed(ID, { objectKey: 'exports/k', bytes: 5 }, NOW);
    expect(s.db.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'RUNNING' },
      data: {
        status: 'SUCCEEDED',
        finishedAt: NOW,
        errorCode: null,
        resultObjectKey: 'exports/k',
        resultBytes: 5n,
        expiresAt: new Date('2026-11-06T12:00:00Z'),
      },
    });
    await s.service.succeed(ID, null, NOW);
    expect(s.db.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultObjectKey: null,
          resultBytes: null,
          expiresAt: null,
        }),
      }),
    );
  });

  it('fail: guarda solo un codigo estable', async () => {
    await s.service.fail(ID, 'select * from x', NOW);
    expect(s.db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ errorCode: 'INTERNAL_ERROR' }) }),
    );
    expect(sanitizeErrorCode('GOTENBERG_TIMEOUT')).toBe('GOTENBERG_TIMEOUT');
    expect(sanitizeErrorCode('x'.repeat(65))).toBe('INTERNAL_ERROR');
  });

  it('expireResults: borra el objeto y pasa a EXPIRED; si S3 falla, deja SUCCEEDED', async () => {
    s.db.findMany.mockResolvedValueOnce([
      { id: 'j1', resultObjectKey: 'exports/a' },
      { id: 'j2', resultObjectKey: 'exports/b' },
    ]);
    s.results.delete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('s3'));
    await expect(s.service.expireResults(NOW)).resolves.toBe(1);
    expect(s.db.updateMany).toHaveBeenCalledTimes(1);
    expect(s.db.updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', status: 'SUCCEEDED' },
      data: { status: 'EXPIRED', resultObjectKey: null, resultBytes: null },
    });
  });
});
