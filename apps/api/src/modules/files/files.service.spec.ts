import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { isValidObjectKey, type StorageService } from '../storage/index.js';
import { ScannerUnavailableError, type FileScanner } from './file-scanner.js';
import { FilesEventPublisher, type FilesEvent } from './files-events.js';
import type { UploadIntentDto } from './files.dto.js';
import { FilesService } from './files.service.js';

const MiB = 1024 * 1024;
const CS = '0199a000-0000-7000-8000-000000000001';
const ASSIGNMENT = '0199a000-0000-7000-8000-000000000002';
const FILE = '0199a000-0000-7000-8000-000000000003';
const PERIOD = '0199a000-0000-7000-8000-000000000004';
const student: AuthenticatedUser = { id: 'alumno-1', role: 'STUDENT' };
const otherStudent: AuthenticatedUser = { id: 'alumno-2', role: 'STUDENT' };
const teacher: AuthenticatedUser = { id: 'docente-1', role: 'TEACHER' };
const guardian: AuthenticatedUser = { id: 'apoderado-1', role: 'GUARDIAN' };
const actor = { id: 'alumno-1', ip: '127.0.0.1' };
const NOW = new Date('2026-10-20T15:00:00.000Z');
const INCOMING = 'incoming/2026/10/0199a000-0000-4000-8000-0000000000aa.pdf';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');
// Nombre con datos del alumno: nunca debe aparecer en bitácora, eventos ni logs.
const ORIGINAL_NAME = 'Tarea de Juana Pérez.pdf';

const submissionDto = (over: Partial<UploadIntentDto> = {}): UploadIntentDto => ({
  purpose: 'SUBMISSION',
  courseSectionId: CS,
  assignmentId: ASSIGNMENT,
  fileName: ORIGINAL_NAME,
  sizeBytes: PDF.length,
  contentType: 'application/pdf',
  ...over,
});

const assignment = (over: Record<string, unknown> = {}) => ({
  courseSectionId: CS,
  periodId: PERIOD,
  dueAt: new Date('2026-10-21T04:59:00.000Z'),
  allowLate: false,
  maxSizeBytes: 20 * MiB,
  deletedAt: null,
  ...over,
});

const storedFile = (over: Record<string, unknown> = {}) => ({
  id: FILE,
  objectKey: INCOMING,
  purpose: 'SUBMISSION',
  courseSectionId: CS,
  assignmentId: ASSIGNMENT,
  uploadedById: student.id,
  originalName: ORIGINAL_NAME,
  maxBytes: 20 * MiB,
  sizeBytes: null,
  sha256: null,
  uploadStatus: 'PENDING',
  scanStatus: 'PENDING',
  rejectReason: null,
  intentExpiresAt: new Date(NOW.getTime() + 5 * 60_000),
  completedAt: null,
  scannedAt: null,
  purgedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  material: null,
  attachedToAssignment: null,
  ...over,
});

function setup() {
  const prisma = {
    storedFile: {
      create: vi.fn().mockResolvedValue({ id: FILE }),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    assignment: { findUnique: vi.fn().mockResolvedValue(assignment()) },
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
  };
  const storage = {
    effectiveMaxSize: (max?: number) => Math.min(max ?? 20 * MiB, 50 * MiB),
    createUploadUrl: vi.fn().mockResolvedValue({
      url: 'http://minio/firmada',
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    }),
    headObject: vi.fn().mockResolvedValue({ sizeBytes: PDF.length, etag: '"e1"' }),
    openObjectStream: vi.fn().mockImplementation(() => Promise.resolve(Readable.from([PDF]))),
    copyObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    createDownloadUrl: vi.fn().mockResolvedValue({
      url: 'http://minio/descarga',
      method: 'GET',
      headers: {},
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    }),
  };
  const access = {
    assertTeacherOf: vi.fn().mockResolvedValue(undefined),
    assertCanAccessCourseSection: vi.fn().mockResolvedValue(undefined),
    assertCourseSectionWritable: vi.fn().mockResolvedValue(undefined),
  };
  const scanner = { scan: vi.fn().mockResolvedValue({ status: 'CLEAN' }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const events = new FilesEventPublisher();
  const published: FilesEvent[] = [];
  events.on('submission.rejected.v1', (e) => void published.push(e));
  const service = new FilesService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    access as unknown as AcademicAccessService,
    scanner as unknown as FileScanner,
    audit as unknown as AuditService,
    events,
  );
  return { service, prisma, storage, access, scanner, audit, published };
}

type Ctx = ReturnType<typeof setup>;
const auditActions = (ctx: Ctx) =>
  ctx.audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
const noOriginalName = (ctx: Ctx) => {
  const dump = JSON.stringify([ctx.audit.record.mock.calls, ctx.published]);
  expect(dump).not.toContain('Juana');
};

describe('FilesService', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = setup();
  });

  describe('createUploadIntent (RF-33/35, RNF-18)', () => {
    it('emite una URL PUT a la cuarentena con el tope de la tarea y sin el nombre en la clave', async () => {
      const res = await ctx.service.createUploadIntent(student, submissionDto(), actor, NOW);
      expect(res).toMatchObject({ fileId: FILE, method: 'PUT', maxBytes: 20 * MiB });
      const data = ctx.prisma.storedFile.create.mock.calls[0][0].data;
      expect(data.objectKey).toMatch(/^incoming\/2026\/10\/[0-9a-f-]{36}\.pdf$/);
      expect(isValidObjectKey(data.objectKey)).toBe(true);
      expect(data).toMatchObject({
        purpose: 'SUBMISSION',
        assignmentId: ASSIGNMENT,
        uploadedById: student.id,
        originalName: ORIGINAL_NAME,
        maxBytes: 20 * MiB,
      });
      expect(ctx.access.assertCanAccessCourseSection).toHaveBeenCalledWith(student, CS);
      expect(ctx.access.assertCourseSectionWritable).toHaveBeenCalledWith(CS, PERIOD);
      expect(auditActions(ctx)).toEqual(['files.upload-intent.created']);
      noOriginalName(ctx);
    });

    it('sanea el nombre original (rutas y caracteres de control)', async () => {
      await ctx.service.createUploadIntent(
        student,
        submissionDto({ fileName: '../../etc/pass\u0000wd' }),
        actor,
        NOW,
      );
      expect(ctx.prisma.storedFile.create.mock.calls[0][0].data.originalName).toBe(
        '.._.._etc_passwd.pdf',
      );
    });

    it('QA-006: 413 si el tamaño declarado supera el tope de la tarea', async () => {
      await expect(
        ctx.service.createUploadIntent(
          student,
          submissionDto({ sizeBytes: 20 * MiB + 1 }),
          actor,
          NOW,
        ),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(ctx.prisma.storedFile.create).not.toHaveBeenCalled();
    });

    it('RF-37: 409 si la tarea venció y no admite tardías; con allowLate sí deja', async () => {
      const late = new Date('2026-10-22T00:00:00.000Z');
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, late),
      ).rejects.toBeInstanceOf(ConflictException);
      ctx.prisma.assignment.findUnique.mockResolvedValue(assignment({ allowLate: true }));
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, late),
      ).resolves.toMatchObject({ fileId: FILE });
    });

    it('RN-10: 409 si el período está cerrado', async () => {
      ctx.access.assertCourseSectionWritable.mockRejectedValue(new ConflictException('cerrado'));
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('403: el docente no entrega y el estudiante no sube materiales', async () => {
      await expect(
        ctx.service.createUploadIntent(teacher, submissionDto(), actor, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        ctx.service.createUploadIntent(
          student,
          submissionDto({ purpose: 'MATERIAL', assignmentId: undefined }),
          actor,
          NOW,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('403 si el estudiante no tiene matrícula vigente en la sección', async () => {
      ctx.access.assertCanAccessCourseSection.mockRejectedValue(new ForbiddenException());
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.prisma.assignment.findUnique).not.toHaveBeenCalled();
    });

    it('400 sin assignmentId en una entrega o con assignmentId en un material', async () => {
      await expect(
        ctx.service.createUploadIntent(
          student,
          submissionDto({ assignmentId: undefined }),
          actor,
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        ctx.service.createUploadIntent(teacher, submissionDto({ purpose: 'MATERIAL' }), actor, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si la tarea es de otro curso-sección o está borrada', async () => {
      ctx.prisma.assignment.findUnique.mockResolvedValue(assignment({ courseSectionId: 'otro' }));
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      ctx.prisma.assignment.findUnique.mockResolvedValue(assignment({ deletedAt: NOW }));
      await expect(
        ctx.service.createUploadIntent(student, submissionDto(), actor, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el docente asignado sube un material con el tope absoluto de 50 MiB', async () => {
      const res = await ctx.service.createUploadIntent(
        teacher,
        submissionDto({ purpose: 'MATERIAL', assignmentId: undefined, sizeBytes: 30 * MiB }),
        { id: teacher.id },
        NOW,
      );
      expect(res.maxBytes).toBe(50 * MiB);
      expect(ctx.access.assertTeacherOf).toHaveBeenCalledWith(teacher.id, CS);
      expect(ctx.access.assertCourseSectionWritable).toHaveBeenCalledWith(CS);
      expect(ctx.prisma.storedFile.create.mock.calls[0][0].data.assignmentId).toBeNull();
    });
  });

  describe('complete (RF-34/35/40)', () => {
    beforeEach(() => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(storedFile());
    });

    it('acepta un PDF limpio: copia al prefijo definitivo, borra la cuarentena y guarda completedAt', async () => {
      const res = await ctx.service.complete(student, FILE, actor, NOW);
      expect(res).toMatchObject({
        fileId: FILE,
        scanStatus: 'CLEAN',
        sizeBytes: PDF.length,
        completedAt: NOW.toISOString(),
      });
      expect(res.sha256).toMatch(/^[0-9a-f]{64}$/);
      const [source, target, etag] = ctx.storage.copyObject.mock.calls[0];
      expect(source).toBe(INCOMING);
      expect(target).toMatch(/^submissions\/2026\/10\/[0-9a-f-]{36}\.pdf$/);
      expect(etag).toBe('"e1"');
      expect(ctx.storage.openObjectStream).toHaveBeenCalledWith(INCOMING, '"e1"');
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
      const update = ctx.prisma.storedFile.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: FILE, uploadStatus: 'PENDING' });
      expect(update.data).toMatchObject({
        objectKey: target,
        uploadStatus: 'COMPLETED',
        scanStatus: 'CLEAN',
        sizeBytes: PDF.length,
        completedAt: NOW,
      });
      expect(auditActions(ctx)).toEqual(['files.upload.accepted']);
      expect(ctx.published).toEqual([]);
      noOriginalName(ctx);
    });

    it('QA-005: 415 si no es un PDF real; borra el objeto, queda INVALID y avisa a Dev 5', async () => {
      ctx.storage.openObjectStream.mockImplementation(() =>
        Promise.resolve(Readable.from([Buffer.from('MZ ejecutable renombrado')])),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
      expect(ctx.storage.copyObject).not.toHaveBeenCalled();
      expect(ctx.scanner.scan).not.toHaveBeenCalled();
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toMatchObject({
        uploadStatus: 'COMPLETED',
        scanStatus: 'INVALID',
        rejectReason: 'NOT_PDF',
      });
      expect(ctx.published).toEqual([
        {
          type: 'submission.rejected.v1',
          payload: {
            uploadId: FILE,
            assignmentId: ASSIGNMENT,
            courseSectionId: CS,
            studentId: student.id,
            reason: 'NOT_PDF',
            rejectedAt: NOW.toISOString(),
          },
        },
      ]);
      expect(auditActions(ctx)).toEqual(['files.upload.rejected']);
      noOriginalName(ctx);
    });

    it('RF-34: 415 si el PDF está cifrado', async () => {
      ctx.storage.openObjectStream.mockImplementation(() =>
        Promise.resolve(Readable.from([Buffer.from('%PDF-1.7\n<< /Encrypt 3 0 R >>\n%%EOF')])),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'ENCRYPTED_PDF' },
      });
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data.rejectReason).toBe(
        'ENCRYPTED_PDF',
      );
    });

    it('QA-006: 413 si el objeto real supera maxBytes (sin leerlo) y sizeBytes queda null', async () => {
      ctx.storage.headObject.mockResolvedValue({ sizeBytes: 20 * MiB + 1, etag: '"e1"' });
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(ctx.storage.openObjectStream).not.toHaveBeenCalled();
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toMatchObject({
        scanStatus: 'INVALID',
        rejectReason: 'TOO_LARGE',
        sizeBytes: null,
      });
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
    });

    it('QA-011: 422 si el antivirus lo detecta; queda INFECTED y nunca se copia', async () => {
      ctx.scanner.scan.mockResolvedValue({ status: 'INFECTED', signature: 'Eicar-Test-Signature' });
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(ctx.storage.copyObject).not.toHaveBeenCalled();
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toMatchObject({
        scanStatus: 'INFECTED',
        rejectReason: 'INFECTED',
      });
      expect(ctx.published[0].payload.reason).toBe('INFECTED');
      expect(JSON.stringify(ctx.audit.record.mock.calls)).not.toContain('Eicar');
    });

    it('RF-40: 503 si clamd está caído; no cambia el estado ni borra, y se puede reintentar', async () => {
      ctx.scanner.scan.mockRejectedValueOnce(new ScannerUnavailableError('ECONNREFUSED'));
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'ANTIVIRUS_UNAVAILABLE' },
      });
      expect(ctx.prisma.storedFile.updateMany).not.toHaveBeenCalled();
      expect(ctx.storage.deleteObject).not.toHaveBeenCalled();
      await expect(ctx.service.complete(student, FILE, actor, NOW)).resolves.toMatchObject({
        scanStatus: 'CLEAN',
      });
    });

    it('503 si el almacenamiento falla a mitad de la lectura', async () => {
      ctx.storage.openObjectStream.mockImplementation(() =>
        Promise.resolve(
          new Readable({
            read() {
              this.destroy(new Error('socket hang up'));
            },
          }),
        ),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('404 si quien confirma no es quien pidió la subida', async () => {
      await expect(ctx.service.complete(otherStudent, FILE, actor, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.storage.headObject).not.toHaveBeenCalled();
    });

    it('idempotente: un archivo ya CLEAN responde lo guardado sin volver a escanear', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        storedFile({
          uploadStatus: 'COMPLETED',
          scanStatus: 'CLEAN',
          sizeBytes: 10,
          sha256: 'a'.repeat(64),
          completedAt: NOW,
        }),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).resolves.toEqual({
        fileId: FILE,
        scanStatus: 'CLEAN',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
        completedAt: NOW.toISOString(),
      });
      expect(ctx.storage.headObject).not.toHaveBeenCalled();
    });

    it('un archivo ya rechazado repite su error', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        storedFile({ uploadStatus: 'COMPLETED', scanStatus: 'INFECTED', rejectReason: 'INFECTED' }),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('RF-37: si la tarea venció al confirmar (sin tardías) responde 409 y la subida vence', async () => {
      await expect(
        ctx.service.complete(student, FILE, actor, new Date('2026-10-22T00:00:00.000Z')),
      ).rejects.toMatchObject({ response: { code: 'DEADLINE_PASSED' } });
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toEqual({
        uploadStatus: 'EXPIRED',
      });
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
      expect(auditActions(ctx)).toEqual(['files.upload.expired']);
    });

    it('409 si el objeto aún no está y la intención sigue vigente (sin cambiar el estado)', async () => {
      ctx.storage.headObject.mockRejectedValue(new NotFoundException());
      ctx.prisma.storedFile.findUnique
        .mockResolvedValueOnce(storedFile())
        .mockResolvedValueOnce(storedFile());
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'UPLOAD_NOT_FOUND' },
      });
      expect(ctx.prisma.storedFile.updateMany).not.toHaveBeenCalled();
    });

    it('409 UPLOAD_EXPIRED si el objeto no está y la intención venció', async () => {
      ctx.storage.headObject.mockRejectedValue(new NotFoundException());
      await expect(
        ctx.service.complete(student, FILE, actor, new Date(NOW.getTime() + 6 * 60_000)),
      ).rejects.toMatchObject({ response: { code: 'UPLOAD_EXPIRED' } });
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toEqual({
        uploadStatus: 'EXPIRED',
        scanStatus: 'INVALID',
        rejectReason: 'MISSING_OBJECT',
      });
    });
  });

  describe('complete: casos límite (QA-006, RF-37, OBJECT_CHANGED)', () => {
    beforeEach(() => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(storedFile());
    });

    it('QA-006: tamaño justo en maxBytes se acepta; un byte más es 413 sin leer el objeto', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(storedFile({ maxBytes: PDF.length }));
      await expect(ctx.service.complete(student, FILE, actor, NOW)).resolves.toMatchObject({
        scanStatus: 'CLEAN',
        sizeBytes: PDF.length,
      });

      ctx.storage.openObjectStream.mockClear();
      ctx.storage.headObject.mockResolvedValue({ sizeBytes: PDF.length + 1, etag: '"e1"' });
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(ctx.storage.openObjectStream).not.toHaveBeenCalled();
    });

    it('QA-006: el objeto real un byte sobre maxBytes (HEAD que no coincide) se corta como 413', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(storedFile({ maxBytes: PDF.length - 1 }));
      ctx.storage.headObject.mockResolvedValue({ sizeBytes: PDF.length - 1, etag: '"e1"' });
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(ctx.storage.copyObject).not.toHaveBeenCalled();
    });

    it('RF-34: un PDF sin %%EOF se rechaza como NOT_PDF', async () => {
      ctx.storage.openObjectStream.mockImplementation(() =>
        Promise.resolve(Readable.from([Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\n')])),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(ctx.storage.copyObject).not.toHaveBeenCalled();
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toMatchObject({
        rejectReason: 'NOT_PDF',
        scanStatus: 'INVALID',
      });
    });

    it('OBJECT_CHANGED: un re-PUT durante la lectura (412) responde 409 y no cambia el estado', async () => {
      ctx.storage.openObjectStream.mockRejectedValueOnce(
        new ConflictException({ code: 'OBJECT_CHANGED', message: 'cambió' }),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'OBJECT_CHANGED' },
      });
      expect(ctx.prisma.storedFile.updateMany).not.toHaveBeenCalled();
      expect(ctx.storage.deleteObject).not.toHaveBeenCalled();
    });

    it('OBJECT_CHANGED: un re-PUT entre el escaneo y la copia no deja el archivo CLEAN', async () => {
      ctx.storage.copyObject.mockRejectedValueOnce(
        new ConflictException({ code: 'OBJECT_CHANGED', message: 'cambió' }),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'OBJECT_CHANGED' },
      });
      expect(ctx.prisma.storedFile.updateMany).not.toHaveBeenCalled();
      expect(auditActions(ctx)).not.toContain('files.upload.accepted');
    });

    it('RF-37: con allowLate la entrega tardía se acepta al confirmar', async () => {
      ctx.prisma.assignment.findUnique.mockResolvedValue(assignment({ allowLate: true }));
      await expect(
        ctx.service.complete(student, FILE, actor, new Date('2026-10-25T00:00:00.000Z')),
      ).resolves.toMatchObject({ scanStatus: 'CLEAN' });
    });

    it('RF-37: justo en dueAt todavía se acepta; un milisegundo después no', async () => {
      const due = assignment().dueAt;
      await expect(ctx.service.complete(student, FILE, actor, due)).resolves.toMatchObject({
        scanStatus: 'CLEAN',
      });
      await expect(
        ctx.service.complete(student, FILE, actor, new Date(due.getTime() + 1)),
      ).rejects.toMatchObject({ response: { code: 'DEADLINE_PASSED' } });
    });

    it('RN-10: con el período cerrado al confirmar la subida vence y se borra el objeto', async () => {
      ctx.access.assertCourseSectionWritable.mockRejectedValueOnce(new ConflictException());
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(ctx.prisma.storedFile.updateMany.mock.calls[0][0].data).toEqual({
        uploadStatus: 'EXPIRED',
      });
      expect(ctx.storage.deleteObject).toHaveBeenCalledWith(INCOMING);
    });

    it('complete tras un rechazo NOT_PDF repite 415 sin volver a leer ni publicar', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        storedFile({ uploadStatus: 'COMPLETED', scanStatus: 'INVALID', rejectReason: 'NOT_PDF' }),
      );
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(ctx.storage.headObject).not.toHaveBeenCalled();
      expect(ctx.published).toEqual([]);
    });

    it('complete sobre una subida EXPIRED responde 409 UPLOAD_EXPIRED sin tocar el almacenamiento', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(storedFile({ uploadStatus: 'EXPIRED' }));
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toMatchObject({
        response: { code: 'UPLOAD_EXPIRED' },
      });
      expect(ctx.storage.headObject).not.toHaveBeenCalled();
    });

    it('RF-40: con clamd caído el estado sigue PENDING, el objeto de incoming/ se conserva y no hay bitácora', async () => {
      ctx.scanner.scan.mockRejectedValueOnce(new ScannerUnavailableError('timeout'));
      await expect(ctx.service.complete(student, FILE, actor, NOW)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(ctx.storage.deleteObject).not.toHaveBeenCalled();
      expect(auditActions(ctx)).toEqual([]);
    });

    it('un ADMIN no confirma la entrega de un alumno (404)', async () => {
      await expect(
        ctx.service.complete({ id: 'admin-1', role: 'ADMIN' }, FILE, actor, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createDownloadUrl (RF-31/40, RNF-03, QA-012)', () => {
    const clean = (over: Record<string, unknown> = {}) =>
      storedFile({
        uploadStatus: 'COMPLETED',
        scanStatus: 'CLEAN',
        objectKey: 'submissions/2026/10/0199a000-0000-4000-8000-0000000000bb.pdf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
        ...over,
      });

    it('el dueño de la entrega obtiene una URL firmada con el nombre saneado', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean());
      const res = await ctx.service.createDownloadUrl(student, FILE, {}, actor);
      expect(res).toEqual({
        url: 'http://minio/descarga',
        method: 'GET',
        expiresAt: expect.any(String) as string,
      });
      expect(ctx.storage.createDownloadUrl).toHaveBeenCalledWith(
        'submissions/2026/10/0199a000-0000-4000-8000-0000000000bb.pdf',
        { fileName: ORIGINAL_NAME, inline: false },
      );
      expect(auditActions(ctx)).toEqual(['files.download-url.issued']);
      noOriginalName(ctx);
    });

    it.each(['PENDING', 'INFECTED', 'INVALID'])('404 si el archivo está %s', async (scanStatus) => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean({ scanStatus }));
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('404 si el archivo fue purgado', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean({ purgedAt: NOW }));
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403 para otro estudiante y para el apoderado; nunca se firma la URL', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean());
      await expect(
        ctx.service.createDownloadUrl(otherStudent, FILE, {}, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ctx.service.createDownloadUrl(guardian, FILE, {}, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('el docente solo descarga entregas de sus cursos', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean());
      ctx.access.assertTeacherOf.mockRejectedValueOnce(new ForbiddenException());
      await expect(ctx.service.createDownloadUrl(teacher, FILE, {}, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(ctx.service.createDownloadUrl(teacher, FILE, {}, actor)).resolves.toMatchObject({
        method: 'GET',
      });
      expect(ctx.access.assertTeacherOf).toHaveBeenCalledWith(teacher.id, CS);
    });

    it('material publicado: cualquier miembro; en la papelera el estudiante recibe 404', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({ purpose: 'MATERIAL', uploadedById: teacher.id, material: { deletedAt: null } }),
      );
      await expect(
        ctx.service.createDownloadUrl(student, FILE, { inline: true }, actor),
      ).resolves.toMatchObject({ method: 'GET' });
      expect(ctx.access.assertCanAccessCourseSection).toHaveBeenCalledWith(student, CS);

      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({ purpose: 'MATERIAL', uploadedById: teacher.id, material: { deletedAt: NOW } }),
      );
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ASSIGNMENT_ATTACHMENT en la papelera: el estudiante recibe 404 y el docente puede', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({
          purpose: 'ASSIGNMENT_ATTACHMENT',
          uploadedById: teacher.id,
          attachedToAssignment: { deletedAt: NOW },
        }),
      );
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(ctx.service.createDownloadUrl(teacher, FILE, {}, actor)).resolves.toMatchObject({
        method: 'GET',
      });
    });

    it('material de otra sección: quien no es miembro recibe 403 y no se firma', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({ purpose: 'MATERIAL', uploadedById: teacher.id, material: { deletedAt: null } }),
      );
      ctx.access.assertCanAccessCourseSection.mockRejectedValueOnce(new ForbiddenException());
      await expect(
        ctx.service.createDownloadUrl(otherStudent, FILE, {}, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.storage.createDownloadUrl).not.toHaveBeenCalled();
    });

    it('el apoderado recibe 403 también en materiales publicados', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({ purpose: 'MATERIAL', uploadedById: teacher.id, material: { deletedAt: null } }),
      );
      await expect(ctx.service.createDownloadUrl(guardian, FILE, {}, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.access.assertCanAccessCourseSection).not.toHaveBeenCalled();
    });

    it('SUBMISSION: un estudiante no activo ya no descarga su propia entrega', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean());
      ctx.prisma.user.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('SUBMISSION: el ADMIN pasa por el acceso a la sección', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(clean());
      const admin: AuthenticatedUser = { id: 'admin-1', role: 'ADMIN' };
      await ctx.service.createDownloadUrl(admin, FILE, {}, actor);
      expect(ctx.access.assertCanAccessCourseSection).toHaveBeenCalledWith(admin, CS);
    });

    it('material aún no publicado: solo quien lo subió', async () => {
      ctx.prisma.storedFile.findUnique.mockResolvedValue(
        clean({ purpose: 'MATERIAL', uploadedById: teacher.id }),
      );
      await expect(ctx.service.createDownloadUrl(student, FILE, {}, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(ctx.service.createDownloadUrl(teacher, FILE, {}, actor)).resolves.toMatchObject({
        method: 'GET',
      });
    });
  });
});
