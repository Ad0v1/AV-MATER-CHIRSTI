import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication, NotFoundException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  FileLifecycleService,
  INTENT_SWEEP_GRACE_MS,
} from './../src/modules/files/file-lifecycle.service.js';
import { StorageService } from './../src/modules/storage/index.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Stub U12 de Dev 3 para los barridos de Dev 5 (RNF-03/18): expireIntents y purge contra MySQL.
// Usa MinIO si responde; si no, StorageService.deleteObject se simula. Las filas y los objetos
// creados se borran al final. Los StoredFile usan el prefijo de titulo/nombre "QA-U12".
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const MIN = 60_000;
const NAME = 'QA-U12 de Juana Pérez.pdf';

const objectKey = (scope: 'incoming' | 'submissions' | 'materials') => {
  const d = new Date();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${scope}/${d.getUTCFullYear()}/${month}/${randomUUID()}.pdf`;
};

describe.skipIf(!process.env.DATABASE_URL)('FileLifecycleService (e2e, MySQL + MinIO)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let lifecycle: FileLifecycleService;
  let sink: MemoryAuditSink;
  let s3: S3Client;
  let bucket: string;
  let useMinio = false;
  let deleteSpy: { mock: unknown } | undefined;

  let courseSectionId: string;
  let teacherId: string;
  let assignmentId: string;
  const fileIds: string[] = [];
  const materialIds: string[] = [];
  const keys: string[] = [];

  const exists = async (key: string) => {
    if (!useMinio) return null;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  };

  const put = async (key: string) => {
    keys.push(key);
    if (useMinio) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('%PDF-1.4 qa') }),
      );
    }
  };

  const mkFile = async (
    key: string,
    data: Record<string, unknown> = {},
    purpose: 'MATERIAL' | 'SUBMISSION' = 'SUBMISSION',
  ) => {
    await put(key);
    const created = await prisma.storedFile.create({
      data: {
        objectKey: key,
        purpose,
        courseSectionId,
        assignmentId: purpose === 'SUBMISSION' ? assignmentId : null,
        uploadedById: teacherId,
        originalName: NAME,
        maxBytes: 1024,
        intentExpiresAt: new Date(),
        ...data,
      } as never,
    });
    fileIds.push(created.id);
    return created;
  };

  const row = (id: string) => prisma.storedFile.findUniqueOrThrow({ where: { id } });
  const auditOf = (action: string, id: string) =>
    sink.records.filter((r) => r.action === action && r.entityId === id);

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
    try {
      const probe = objectKey('incoming');
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: probe, Body: Buffer.from('x') }));
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: probe }));
      useMinio = true;
    } catch {
      useMinio = false;
    }

    const year = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Matemática' },
        section: { academicYearId: year.id, gradeLevel: 3, code: 'A' },
      },
    });
    courseSectionId = cs.id;
    teacherId = cs.teacherId!;
    const period = await prisma.academicPeriod.findFirstOrThrow({
      where: { academicYearId: year.id, closedAt: null },
      orderBy: { sequence: 'desc' },
    });
    assignmentId = (
      await prisma.assignment.create({
        data: {
          courseSectionId,
          periodId: period.id,
          title: 'QA-U12 tarea',
          instructions: 'e2e ciclo de vida de archivos',
          createdById: teacherId,
          dueAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        } as never,
      })
    ).id;

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    lifecycle = app.get(FileLifecycleService);
    if (!useMinio) {
      deleteSpy = vi.spyOn(app.get(StorageService), 'deleteObject').mockResolvedValue(undefined);
    }
  });

  afterAll(async () => {
    if (!app) return;
    await prisma.material.deleteMany({ where: { id: { in: materialIds } } });
    await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    if (useMinio) {
      for (const Key of keys) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })).catch(() => undefined);
      }
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe('expireIntents', () => {
    it('RNF-18: barre el intent PENDING vencido, borra incoming/ y deja bitacora del sistema', async () => {
      const now = new Date();
      const old = await mkFile(objectKey('incoming'), {
        intentExpiresAt: new Date(now.getTime() - INTENT_SWEEP_GRACE_MS - MIN),
      });
      expect(await exists(old.objectKey)).toBe(useMinio ? true : null);

      const swept = await lifecycle.expireIntents(now);
      expect(swept).toBeGreaterThanOrEqual(1);
      expect((await row(old.id)).uploadStatus).toBe('EXPIRED');
      expect(await exists(old.objectKey)).toBe(useMinio ? false : null);
      if (deleteSpy) expect(deleteSpy as never).toHaveBeenCalledWith(old.objectKey);

      const logs = auditOf('files.upload.expired', old.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ module: 'files', entityType: 'StoredFile' });
      expect(logs[0].actorId).toBeUndefined();
      expect(JSON.stringify(logs[0])).not.toMatch(/Juana|QA-U12/);
    });

    it('la gracia de 15 min: vencido hace 14 min NO se barre; hace 16 min SI', async () => {
      const now = new Date();
      const inGrace = await mkFile(objectKey('incoming'), {
        intentExpiresAt: new Date(now.getTime() - 14 * MIN),
      });
      const past = await mkFile(objectKey('incoming'), {
        intentExpiresAt: new Date(now.getTime() - 16 * MIN),
      });
      await lifecycle.expireIntents(now);
      expect((await row(inGrace.id)).uploadStatus).toBe('PENDING');
      expect(await exists(inGrace.objectKey)).toBe(useMinio ? true : null);
      expect((await row(past.id)).uploadStatus).toBe('EXPIRED');
    });

    it('no toca COMPLETED ni EXPIRED ni un intent vigente', async () => {
      const now = new Date();
      const completed = await mkFile(objectKey('submissions'), {
        uploadStatus: 'COMPLETED',
        completedAt: now,
        intentExpiresAt: new Date(now.getTime() - 60 * MIN),
      });
      const fresh = await mkFile(objectKey('incoming'), {
        intentExpiresAt: new Date(now.getTime() + 5 * MIN),
      });
      await lifecycle.expireIntents(now);
      expect((await row(completed.id)).uploadStatus).toBe('COMPLETED');
      expect(await exists(completed.objectKey)).toBe(useMinio ? true : null);
      expect((await row(fresh.id)).uploadStatus).toBe('PENDING');
    });

    it('es idempotente: la segunda corrida no vuelve a registrar bitacora', async () => {
      const now = new Date();
      const old = await mkFile(objectKey('incoming'), {
        intentExpiresAt: new Date(now.getTime() - 30 * MIN),
      });
      await lifecycle.expireIntents(now);
      await lifecycle.expireIntents(now);
      expect(auditOf('files.upload.expired', old.id)).toHaveLength(1);
    });

    it('un objeto ya ausente no impide marcar EXPIRED (borrar un objeto ausente no falla)', async () => {
      const now = new Date();
      const key = objectKey('incoming');
      const old = await mkFile(key, { intentExpiresAt: new Date(now.getTime() - 30 * MIN) });
      if (useMinio) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      await lifecycle.expireIntents(now);
      expect((await row(old.id)).uploadStatus).toBe('EXPIRED');
    });
  });

  describe('purge', () => {
    it('RNF-03: purga un StoredFile no reutilizable: borra el objeto, marca purgedAt y deja bitacora', async () => {
      const file = await mkFile(objectKey('submissions'), { uploadStatus: 'COMPLETED' });
      await expect(lifecycle.purge(file.id, null)).resolves.toBe('PURGED');
      const after = await row(file.id);
      expect(after.purgedAt).not.toBeNull();
      expect(await exists(file.objectKey)).toBe(useMinio ? false : null);
      const logs = auditOf('files.file.purge', file.id);
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs[0])).not.toMatch(/Juana|QA-U12/);
      expect(logs[0].actorId).toBeUndefined();
    });

    it('registra al actor humano cuando lo hay', async () => {
      const file = await mkFile(objectKey('submissions'), { uploadStatus: 'COMPLETED' });
      await expect(lifecycle.purge(file.id, teacherId)).resolves.toBe('PURGED');
      expect(auditOf('files.file.purge', file.id)[0].actorId).toBe(teacherId);
    });

    it('ya purgado: ALREADY_PURGED sin segunda bitacora', async () => {
      const file = await mkFile(objectKey('submissions'), { uploadStatus: 'COMPLETED' });
      await lifecycle.purge(file.id, null);
      await expect(lifecycle.purge(file.id, null)).resolves.toBe('ALREADY_PURGED');
      expect(auditOf('files.file.purge', file.id)).toHaveLength(1);
    });

    it('un Material reutilizable NO se purga; uno no reutilizable si', async () => {
      const make = async (isReusable: boolean) => {
        const file = await mkFile(
          objectKey('materials'),
          { uploadStatus: 'COMPLETED' },
          'MATERIAL',
        );
        const material = await prisma.material.create({
          data: {
            courseSectionId,
            kind: 'CLASS',
            title: 'QA-U12 material',
            fileId: file.id,
            isReusable,
            createdById: teacherId,
          },
        });
        materialIds.push(material.id);
        return file;
      };
      const reusable = await make(true);
      const plain = await make(false);

      await expect(lifecycle.purge(reusable.id, null)).resolves.toBe('SKIPPED_REUSABLE');
      expect((await row(reusable.id)).purgedAt).toBeNull();
      expect(await exists(reusable.objectKey)).toBe(useMinio ? true : null);
      expect(auditOf('files.file.purge', reusable.id)).toHaveLength(0);

      await expect(lifecycle.purge(plain.id, null)).resolves.toBe('PURGED');
      expect((await row(plain.id)).purgedAt).not.toBeNull();
      expect(await exists(plain.objectKey)).toBe(useMinio ? false : null);
    });

    it('archivo inexistente: 404 FILE_NOT_FOUND', async () => {
      const err = await lifecycle.purge(randomUUID(), null).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({ code: 'FILE_NOT_FOUND' });
    });

    it('si S3 cae, lanza y NO marca purgedAt; al volver, se purga (reintento)', async () => {
      const file = await mkFile(objectKey('submissions'), { uploadStatus: 'COMPLETED' });
      const storage = app.get(StorageService);
      const failing = vi
        .spyOn(storage, 'deleteObject')
        .mockRejectedValueOnce(new Error('S3 caido'));
      await expect(lifecycle.purge(file.id, null)).rejects.toThrow();
      expect((await row(file.id)).purgedAt).toBeNull();
      expect(auditOf('files.file.purge', file.id)).toHaveLength(0);
      failing.mockRestore();
      // Si no hay MinIO, reponer el simulado general del suite.
      if (!useMinio) {
        deleteSpy = vi.spyOn(storage, 'deleteObject').mockResolvedValue(undefined);
      }
      await expect(lifecycle.purge(file.id, null)).resolves.toBe('PURGED');
    });
  });
});
