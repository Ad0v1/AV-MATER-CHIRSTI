import { describe, expect, it, vi } from 'vitest';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { StorageService } from '../storage/index.js';
import {
  FileLifecycleService,
  INTENT_SWEEP_BATCH,
  INTENT_SWEEP_GRACE_MS,
} from './file-lifecycle.service.js';

const CS = '0199a000-0000-7000-8000-000000000001';
const ASSIGNMENT = '0199a000-0000-7000-8000-000000000002';
const FILE = '0199a000-0000-7000-8000-000000000003';
const FILE_2 = '0199a000-0000-7000-8000-000000000005';
const ADMIN = '0199a000-0000-7000-8000-0000000000ad';
const NOW = new Date('2026-10-30T15:00:00.000Z');
const INCOMING = 'incoming/2026/10/0199a000-0000-4000-8000-0000000000aa.pdf';
const FINAL = 'submissions/2026/10/0199a000-0000-4000-8000-0000000000bb.pdf';
const ORIGINAL_NAME = 'Tarea de Juana Pérez.pdf';

function setup() {
  const prisma = {
    storedFile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new FileLifecycleService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { prisma, storage, audit, service };
}

const intent = (over: Record<string, unknown> = {}) => ({
  id: FILE,
  objectKey: INCOMING,
  purpose: 'SUBMISSION',
  courseSectionId: CS,
  assignmentId: ASSIGNMENT,
  ...over,
});

const file = (over: Record<string, unknown> = {}) => ({
  id: FILE,
  objectKey: FINAL,
  purpose: 'SUBMISSION',
  courseSectionId: CS,
  assignmentId: ASSIGNMENT,
  purgedAt: null,
  material: null,
  ...over,
});

describe('FileLifecycleService.expireIntents', () => {
  it('busca PENDING vencidos con margen, en lote y en orden', async () => {
    const { prisma, service } = setup();
    await service.expireIntents(NOW);
    const cutoff = new Date(NOW.getTime() - INTENT_SWEEP_GRACE_MS);
    expect(prisma.storedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadStatus: 'PENDING', intentExpiresAt: { lt: cutoff } },
        orderBy: { intentExpiresAt: 'asc' },
        take: INTENT_SWEEP_BATCH,
      }),
    );
    // Nunca se lee el nombre original.
    const select = prisma.storedFile.findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.originalName).toBeUndefined();
  });

  it('marca EXPIRED con guarda, borra incoming/ y registra bitácora del sistema', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findMany.mockResolvedValue([intent(), intent({ id: FILE_2 })]);

    await expect(service.expireIntents(NOW)).resolves.toBe(2);

    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: FILE, uploadStatus: 'PENDING' }),
      data: { uploadStatus: 'EXPIRED' },
    });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).toHaveBeenCalledWith(INCOMING);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: undefined,
        module: 'files',
        action: 'files.upload.expired',
        entityType: 'StoredFile',
        entityId: FILE,
      }),
    );
  });

  it('es idempotente: si otro proceso ya lo cambió, no borra ni registra', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findMany.mockResolvedValue([intent()]);
    prisma.storedFile.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.expireIntents(NOW)).resolves.toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('no borra objetos fuera de incoming/', async () => {
    const { prisma, storage, service } = setup();
    prisma.storedFile.findMany.mockResolvedValue([intent({ objectKey: FINAL })]);

    await expect(service.expireIntents(NOW)).resolves.toBe(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('si S3 falla al borrar, sigue con el resto', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findMany.mockResolvedValue([intent(), intent({ id: FILE_2 })]);
    storage.deleteObject.mockRejectedValueOnce(new ServiceUnavailableException());

    await expect(service.expireIntents(NOW)).resolves.toBe(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('sin candidatos devuelve 0', async () => {
    const { service, prisma } = setup();
    await expect(service.expireIntents(NOW)).resolves.toBe(0);
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
  });
});

describe('FileLifecycleService.purge', () => {
  it('borra el objeto, marca purgedAt y registra files.file.purge sin datos personales', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file());

    await expect(service.purge(FILE, ADMIN)).resolves.toBe('PURGED');

    expect(storage.deleteObject).toHaveBeenCalledWith(FINAL);
    expect(prisma.storedFile.updateMany).toHaveBeenCalledWith({
      where: { id: FILE, purgedAt: null },
      data: { purgedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN,
        module: 'files',
        action: 'files.file.purge',
        entityType: 'StoredFile',
        entityId: FILE,
      }),
    );
    const recorded = JSON.stringify(audit.record.mock.calls[0][0]);
    expect(recorded).not.toContain(ORIGINAL_NAME);
    expect(recorded).not.toContain(FINAL);
    // No se pide el nombre original a la BD.
    const select = prisma.storedFile.findUnique.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.originalName).toBeUndefined();
  });

  it('actor null = sistema', async () => {
    const { prisma, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file());

    await expect(service.purge(FILE, null)).resolves.toBe('PURGED');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: undefined }));
  });

  it('ya purgado: ALREADY_PURGED sin tocar S3 ni bitácora', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file({ purgedAt: NOW }));

    await expect(service.purge(FILE, null)).resolves.toBe('ALREADY_PURGED');
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('purga concurrente: la segunda ve count 0 y devuelve ALREADY_PURGED sin bitácora', async () => {
    const { prisma, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file());
    prisma.storedFile.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.purge(FILE, null)).resolves.toBe('ALREADY_PURGED');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('Material reutilizable: SKIPPED_REUSABLE sin borrar', async () => {
    const { prisma, storage, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(
      file({ purpose: 'MATERIAL', assignmentId: null, material: { isReusable: true } }),
    );

    await expect(service.purge(FILE, null)).resolves.toBe('SKIPPED_REUSABLE');
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('Material no reutilizable sí se purga', async () => {
    const { prisma, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(
      file({ purpose: 'MATERIAL', assignmentId: null, material: { isReusable: false } }),
    );
    await expect(service.purge(FILE, null)).resolves.toBe('PURGED');
  });

  it('si S3 falla, lanza y no marca purgedAt (el job reintenta)', async () => {
    const { prisma, storage, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file());
    storage.deleteObject.mockRejectedValue(new ServiceUnavailableException());

    await expect(service.purge(FILE, null)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.storedFile.updateMany).not.toHaveBeenCalled();
  });

  it('archivo inexistente: 404 FILE_NOT_FOUND', async () => {
    const { service } = setup();
    await expect(service.purge(FILE, null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('si la bitácora falla, la purga igual se confirma', async () => {
    const { prisma, audit, service } = setup();
    prisma.storedFile.findUnique.mockResolvedValue(file());
    audit.record.mockRejectedValue(new Error('db down'));
    await expect(service.purge(FILE, null)).resolves.toBe('PURGED');
  });
});
