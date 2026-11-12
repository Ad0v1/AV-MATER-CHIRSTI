import { ConflictException, GoneException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.js';
import type { QueueService } from '../queue/index.js';
import { BackgroundJobService } from './background-job.service.js';
import type { JobResultStorage } from './job-result.storage.js';

const ID = '0192f0c4-0000-7000-8000-000000000001';
const NOW = new Date('2026-10-30T12:00:00Z');
const owner = { id: 'u1', role: 'TEACHER' as const };

const row = (over: Record<string, unknown> = {}) => ({
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
});

function setup() {
  const db = {
    create: vi.fn(),
    findUnique: vi.fn(() => Promise.resolve(row() as Record<string, unknown> | null)),
    findMany: vi.fn(() =>
      Promise.resolve([] as Array<{ id: string; resultObjectKey: string | null }>),
    ),
    updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };
  const results = {
    createDownloadUrl: vi.fn(() => Promise.resolve({ url: 'u', method: 'GET' })),
    delete: vi.fn(() => Promise.resolve()),
  };
  const service = new BackgroundJobService(
    { backgroundJob: db } as unknown as PrismaService,
    { enqueue: vi.fn() } as unknown as QueueService,
    results as unknown as JobResultStorage,
    { EXPORT_TTL_DAYS: 7 } as Env,
  );
  return { db, results, service };
}

describe('BackgroundJobService: reintento, expiracion y descarga (RNF-19, U6)', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('reintento: start acepta RUNNING y suma un intento', async () => {
    s.db.findUnique.mockResolvedValue({ id: ID, type: 'BULK_EXPORT', params: {}, attempts: 2 });
    await expect(s.service.start(ID, NOW)).resolves.toMatchObject({ attempts: 2 });
    expect(s.db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ID, status: { in: ['QUEUED', 'RUNNING'] } },
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });

  it('start: si la fila desaparece entre el UPDATE y la lectura devuelve null', async () => {
    s.db.findUnique.mockResolvedValueOnce(null);
    await expect(s.service.start(ID, NOW)).resolves.toBeNull();
  });

  it('succeed y fail devuelven false si la fila no estaba en el estado esperado', async () => {
    s.db.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.service.succeed(ID, null, NOW)).resolves.toBe(false);
    await expect(s.service.fail(ID, 'X', NOW)).resolves.toBe(false);
  });

  it('fail desde QUEUED o RUNNING y nunca desde SUCCEEDED/EXPIRED', async () => {
    await s.service.fail(ID, 'X', NOW);
    expect(s.db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID, status: { in: ['QUEUED', 'RUNNING'] } } }),
    );
  });

  it('expireResults: solo SUCCEEDED con expiresAt <= ahora, lote de 100, el mas viejo primero', async () => {
    await expect(s.service.expireResults(NOW)).resolves.toBe(0);
    expect(s.db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'SUCCEEDED', expiresAt: { lte: NOW } },
        orderBy: { expiresAt: 'asc' },
        take: 100,
      }),
    );
    expect(s.db.updateMany).not.toHaveBeenCalled();
  });

  it('expireResults: sin clave no llama a S3 y una carrera (count 0) no suma', async () => {
    s.db.findMany.mockResolvedValueOnce([
      { id: 'j1', resultObjectKey: null },
      { id: 'j2', resultObjectKey: 'exports/b' },
    ]);
    s.db.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(s.service.expireResults(NOW)).resolves.toBe(1);
    expect(s.results.delete).toHaveBeenCalledTimes(1);
    expect(s.results.delete).toHaveBeenCalledWith('exports/b');
  });

  it('descarga: expiresAt == ahora ya es 410 aunque la fila siga SUCCEEDED', async () => {
    s.db.findUnique.mockResolvedValueOnce(
      row({ status: 'SUCCEEDED', resultObjectKey: 'exports/k', expiresAt: NOW }),
    );
    await expect(s.service.createDownloadUrl(ID, owner, 'r', NOW)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(s.results.createDownloadUrl).not.toHaveBeenCalled();
  });

  it('descarga: FAILED, RUNNING y SUCCEEDED sin clave dan 409, no una URL', async () => {
    for (const over of [{ status: 'FAILED' }, { status: 'RUNNING' }, { status: 'SUCCEEDED' }]) {
      s.db.findUnique.mockResolvedValueOnce(row(over));
      await expect(s.service.createDownloadUrl(ID, owner, 'r', NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
    expect(s.results.createDownloadUrl).not.toHaveBeenCalled();
  });
});
