import { Readable } from 'node:stream';
import { PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import type { StorageService } from '../storage/index.js';
import { parseClamdReply } from './clamav.scanner.js';
import type { FileScanner } from './file-scanner.js';
import { FilesController } from './files.controller.js';
import { FilesEventPublisher, type FilesEvent } from './files-events.js';
import { FilesService } from './files.service.js';
import { COMPLETE_THROTTLE, trackByUser, UPLOAD_INTENT_THROTTLE } from './files-throttle.js';

// Correcciones de seguridad de la fase 3b (INFORME 7 / Decisión 7 del expediente de Dev 3).

const MiB = 1024 * 1024;
const NOW = new Date('2026-10-20T15:00:00.000Z');
const FILE = '0199a000-0000-7000-8000-000000000003';
const INCOMING = 'incoming/2026/10/0199a000-0000-4000-8000-0000000000aa.pdf';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');
const student = { id: 'alumno-1', role: 'STUDENT' as const };

function setup() {
  const prisma = {
    storedFile: {
      findUnique: vi.fn().mockResolvedValue({
        id: FILE,
        objectKey: INCOMING,
        purpose: 'SUBMISSION',
        courseSectionId: 'cs',
        assignmentId: 'tarea',
        uploadedById: student.id,
        maxBytes: 50 * MiB,
        uploadStatus: 'PENDING',
        scanStatus: 'PENDING',
        rejectReason: null,
        intentExpiresAt: new Date(NOW.getTime() + 300_000),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    assignment: {
      findUnique: vi.fn().mockResolvedValue({
        courseSectionId: 'cs',
        periodId: 'p',
        dueAt: new Date(NOW.getTime() + 86_400_000),
        allowLate: false,
        maxSizeBytes: 50 * MiB,
        deletedAt: null,
      }),
    },
  };
  const storage = {
    effectiveMaxSize: (max?: number) => Math.min(max ?? 20 * MiB, 50 * MiB),
    headObject: vi.fn().mockResolvedValue({ sizeBytes: PDF.length, etag: '"e1"' }),
    openObjectStream: vi.fn().mockImplementation(() => Promise.resolve(Readable.from([PDF]))),
    copyObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  const access = {
    assertCanAccessCourseSection: vi.fn().mockResolvedValue(undefined),
    assertCourseSectionWritable: vi.fn().mockResolvedValue(undefined),
  };
  const scanner = { scan: vi.fn().mockResolvedValue({ status: 'CLEAN' }) };
  const events = new FilesEventPublisher();
  const published: FilesEvent[] = [];
  events.on('submission.rejected.v1', (e) => void published.push(e));
  const service = new FilesService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    access as unknown as AcademicAccessService,
    scanner as unknown as FileScanner,
    { record: vi.fn() } as unknown as AuditService,
    events,
  );
  return { service, prisma, storage, scanner, published };
}

describe('Fase 3b, correcciones de seguridad', () => {
  it('clamd "INSTREAM size limit exceeded" es TOO_LARGE, no una caída', () => {
    expect(parseClamdReply('INSTREAM size limit exceeded. ERROR\0')).toEqual({
      status: 'TOO_LARGE',
    });
  });

  it('si clamd no admite el tamaño: 413 FILE_TOO_LARGE, se borra el objeto y queda INVALID', async () => {
    const ctx = setup();
    ctx.scanner.scan.mockResolvedValue({ status: 'TOO_LARGE' });
    const error: unknown = await ctx.service
      .complete(student, FILE, { id: student.id }, NOW)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect((error as PayloadTooLargeException).getResponse()).toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toMatchObject({
      scanStatus: 'INVALID',
      rejectReason: 'TOO_LARGE',
    });
    expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
    expect(ctx.storage.copyObject).not.toHaveBeenCalled();
    expect(ctx.published[0].payload.reason).toBe('TOO_LARGE');
  });

  it('HEAD sin ETag: 503 STORAGE_UNAVAILABLE sin leer, escanear ni cambiar el estado', async () => {
    const ctx = setup();
    ctx.storage.headObject.mockResolvedValue({ sizeBytes: PDF.length });
    const error: unknown = await ctx.service
      .complete(student, FILE, { id: student.id }, NOW)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });
    expect(ctx.storage.openObjectStream).not.toHaveBeenCalled();
    expect(ctx.scanner.scan).not.toHaveBeenCalled();
    expect(ctx.prisma.storedFile.updateMany).not.toHaveBeenCalled();
  });

  it('el límite de peticiones se cuenta por usuario autenticado; sin sesión, por IP', async () => {
    await expect(
      trackByUser({ user: { id: 'u1', role: 'STUDENT' }, ip: '10.0.0.1' }),
    ).resolves.toBe('user:u1');
    await expect(trackByUser({ ip: '10.0.0.1' })).resolves.toBe('ip:10.0.0.1');
  });

  it('upload-intents 20/min y complete 30/min, ambos por usuario', () => {
    const reflector = new Reflector();
    const meta = (handler: keyof FilesController, key: string) =>
      reflector.get<unknown>(key, FilesController.prototype[handler] as () => unknown);
    expect(meta('createUploadIntent', 'THROTTLER:LIMITdefault')).toBe(20);
    expect(meta('createUploadIntent', 'THROTTLER:TRACKERdefault')).toBe(trackByUser);
    expect(meta('complete', 'THROTTLER:LIMITdefault')).toBe(30);
    expect(meta('complete', 'THROTTLER:TTLdefault')).toBe(60_000);
    expect(meta('complete', 'THROTTLER:TRACKERdefault')).toBe(trackByUser);
    expect(UPLOAD_INTENT_THROTTLE.default.limit).toBe(20);
    expect(COMPLETE_THROTTLE.default.limit).toBe(30);
  });
});
