import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { StoredFile } from '../../generated/prisma/client.js';
import type { FilePurpose, FileRejectReason } from '../../generated/prisma/enums.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import type { Actor } from '../academic/request-user.js';
import {
  ABSOLUTE_MAX_SIZE_BYTES,
  BYTES_PER_MB,
  StorageService,
  buildObjectKey,
  safeDownloadFileName,
  type ObjectScope,
} from '../storage/index.js';
import { INTENT_SWEEP_GRACE_MS } from './file-lifecycle.service.js';
import { FileScanner, ScannerUnavailableError } from './file-scanner.js';
import { recordFiles } from './files-audit.js';
import { FilesEventPublisher } from './files-events.js';
import type {
  CompleteResponse,
  DownloadUrlDto,
  DownloadUrlResponse,
  UploadIntentDto,
  UploadIntentResponse,
} from './files.dto.js';
import { assertSubmissionsAllowed } from '../submissions/submissions.policy.js';
import { inspectPdfStream, verdictOf } from './pdf-inspector.js';

// Flujo de archivos de Dev 3 (RF-33..35, RF-40, RNF-03/18), fase 3b:
//   1. upload-intent: permisos → fila PENDING → URL PUT firmada a incoming/ (cuarentena, 5 min).
//   2. complete: HEAD ≤ maxBytes → PDF real + sha256 (stream) → ClamAV → copia al prefijo
//      definitivo → CLEAN. Si se rechaza: se borra el objeto y queda INVALID o INFECTED.
//   3. download-url: solo CLEAN, solo miembros, URL GET firmada de 60 s.
// El nombre original nunca va a la clave, a la bitácora, a los eventos ni a los logs.

const SCOPE_BY_PURPOSE: Record<FilePurpose, ObjectScope> = {
  MATERIAL: 'materials',
  ASSIGNMENT_ATTACHMENT: 'assignments',
  SUBMISSION: 'submissions',
};

type UploadTarget = {
  purpose: FilePurpose;
  courseSectionId: string;
  assignmentId?: string | null;
};

const NOT_FOUND = { code: 'FILE_NOT_FOUND', message: 'El archivo no existe' };

@Injectable()
export class FilesService {
  private readonly logger = new Logger('Files');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AcademicAccessService,
    private readonly scanner: FileScanner,
    private readonly audit: AuditService,
    private readonly events: FilesEventPublisher,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /files/upload-intents

  async createUploadIntent(
    user: AuthenticatedUser,
    dto: UploadIntentDto,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<UploadIntentResponse> {
    if (dto.purpose === 'SUBMISSION' && !dto.assignmentId) {
      throw validation('assignmentId', 'Obligatorio para una entrega');
    }
    if (dto.purpose !== 'SUBMISSION' && dto.assignmentId) {
      throw validation('assignmentId', 'Solo se envía para una entrega');
    }

    const { maxBytes } = await this.assertCanUpload(user, dto, now);
    if (dto.sizeBytes > maxBytes) throw tooLarge(maxBytes);

    const incomingKey = buildObjectKey('incoming', now);
    const signed = await this.storage.createUploadUrl({
      key: incomingKey,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      maxSizeBytes: maxBytes,
    });

    const file = await this.prisma.storedFile.create({
      data: {
        objectKey: incomingKey,
        purpose: dto.purpose,
        courseSectionId: dto.courseSectionId,
        assignmentId: dto.purpose === 'SUBMISSION' ? dto.assignmentId : null,
        uploadedById: user.id,
        originalName: safeDownloadFileName(dto.fileName),
        maxBytes,
        intentExpiresAt: new Date(signed.expiresAt),
      },
      select: { id: true },
    });

    await recordFiles(this.audit, actor, 'upload-intent.created', file.id, {
      purpose: dto.purpose,
      courseSectionId: dto.courseSectionId,
      assignmentId: dto.assignmentId ?? null,
      declaredSizeBytes: dto.sizeBytes,
      maxBytes,
    });

    return {
      fileId: file.id,
      uploadUrl: signed.url,
      method: 'PUT',
      headers: signed.headers,
      expiresAt: signed.expiresAt,
      maxBytes,
    };
  }

  // ---------------------------------------------------------------------------
  // POST /files/:id/complete

  async complete(
    user: AuthenticatedUser,
    fileId: string,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<CompleteResponse> {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    // Solo quien pidió la subida la confirma; para el resto el archivo "no existe".
    if (!file || file.uploadedById !== user.id) throw new NotFoundException(NOT_FOUND);
    if (file.uploadStatus === 'COMPLETED') return replay(file);
    if (file.uploadStatus === 'EXPIRED') throw expired();
    // Intent vencido (más el mismo margen del barrido): no se valida ni se acepta. La guarda
    // optimista de expire() (uploadStatus PENDING) evita pisar un complete concurrente.
    if (now.getTime() > file.intentExpiresAt.getTime() + INTENT_SWEEP_GRACE_MS) {
      await this.expire(file, actor, null);
      throw expired();
    }

    // Los permisos se revisan otra vez: la matrícula, el plazo o el período pudieron cambiar.
    try {
      await this.assertCanUpload(user, file, now);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() !== 503) {
        await this.expire(file, actor, null);
      }
      throw error;
    }

    try {
      return await this.validateAndAccept(file, actor, now);
    } catch (error) {
      // Otro complete concurrente pudo terminar primero (y borrar la cuarentena).
      const current = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
      if (current && current.uploadStatus === 'COMPLETED' && current.rejectReason === null) {
        return replay(current);
      }
      throw error;
    }
  }

  private async validateAndAccept(
    file: StoredFile,
    actor: Actor,
    now: Date,
  ): Promise<CompleteResponse> {
    const key = file.objectKey;

    let head: { sizeBytes: number; etag?: string };
    try {
      head = await this.storage.headObject(key);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      if (now.getTime() > file.intentExpiresAt.getTime()) {
        await this.expire(file, actor, 'MISSING_OBJECT');
        throw expired();
      }
      throw new ConflictException({
        code: 'UPLOAD_NOT_FOUND',
        message: 'El archivo todavía no se terminó de subir',
      });
    }

    // Sin ETag no se puede leer con If-Match ni copiar con CopySourceIfMatch: no se sigue a
    // ciegas (se escanearía una versión y se copiaría otra). 503 y se puede reintentar.
    if (!head.etag) {
      this.logger.error(`HEAD sin ETag para el archivo ${file.id}`);
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message:
          'El almacenamiento no está disponible en este momento. Intenta de nuevo en unos minutos.',
      });
    }

    if (head.sizeBytes > file.maxBytes) {
      return this.reject(file, actor, now, 'TOO_LARGE', { sizeBytes: null, sha256: null });
    }

    const inspection = await this.readObject(key, head.etag, (stream) =>
      inspectPdfStream(stream, file.maxBytes),
    );
    const verdict = verdictOf(inspection);
    if (verdict !== 'OK') {
      return this.reject(file, actor, now, verdict, {
        sizeBytes:
          verdict === 'TOO_LARGE' || inspection.sizeBytes === 0 ? null : inspection.sizeBytes,
        sha256: inspection.sha256,
      });
    }

    const scan = await this.readObject(key, head.etag, (stream) => this.scanner.scan(stream));
    if (scan.status === 'TOO_LARGE') {
      // clamd no lo admite (StreamMaxLength): sin escaneo no se acepta; 413 como cualquier exceso.
      this.logger.warn(`Archivo ${file.id} supera el límite de clamd`);
      return this.reject(file, actor, now, 'TOO_LARGE', {
        sizeBytes: inspection.sizeBytes,
        sha256: inspection.sha256,
      });
    }
    if (scan.status === 'INFECTED') {
      // La firma no es un dato personal, pero no va a la bitácora ni al evento.
      this.logger.warn(`Archivo ${file.id} infectado: ${scan.signature}`);
      return this.reject(file, actor, now, 'INFECTED', {
        sizeBytes: inspection.sizeBytes,
        sha256: inspection.sha256,
      });
    }

    // Copia a la clave definitiva: un segundo PUT con la misma URL firmada ya no la alcanza.
    const finalKey = buildObjectKey(SCOPE_BY_PURPOSE[file.purpose], now);
    await this.storage.copyObject(key, finalKey, head.etag);

    const updated = await this.prisma.storedFile.updateMany({
      where: { id: file.id, uploadStatus: 'PENDING' },
      data: {
        objectKey: finalKey,
        uploadStatus: 'COMPLETED',
        scanStatus: 'CLEAN',
        rejectReason: null,
        sizeBytes: inspection.sizeBytes,
        sha256: inspection.sha256,
        completedAt: now,
        scannedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      // Ganó otra confirmación concurrente: se descarta esta copia y se responde lo guardado.
      await this.safeDelete(finalKey, file.id);
      const current = await this.prisma.storedFile.findUniqueOrThrow({ where: { id: file.id } });
      return replay(current);
    }
    await this.safeDelete(key, file.id);

    await recordFiles(this.audit, actor, 'upload.accepted', file.id, {
      purpose: file.purpose,
      courseSectionId: file.courseSectionId,
      assignmentId: file.assignmentId,
      sizeBytes: inspection.sizeBytes,
      sha256: inspection.sha256,
    });

    return {
      fileId: file.id,
      scanStatus: 'CLEAN',
      sizeBytes: inspection.sizeBytes,
      sha256: inspection.sha256!,
      completedAt: now.toISOString(),
    };
  }

  /** Lee el objeto con `reader`, traduciendo fallos a 503 (S3 o antivirus caídos). */
  private async readObject<T>(
    key: string,
    etag: string | undefined,
    reader: (stream: Awaited<ReturnType<StorageService['openObjectStream']>>) => Promise<T>,
  ): Promise<T> {
    const stream = await this.storage.openObjectStream(key, etag);
    try {
      return await reader(stream);
    } catch (error) {
      stream.destroy();
      if (error instanceof HttpException) throw error;
      if (error instanceof ScannerUnavailableError) {
        this.logger.error(`Antivirus no disponible: ${error.message}`);
        throw new ServiceUnavailableException({
          code: 'ANTIVIRUS_UNAVAILABLE',
          message:
            'El antivirus no está disponible en este momento. Intenta de nuevo en unos minutos.',
        });
      }
      this.logger.error(
        `Error al leer el objeto: ${error instanceof Error ? error.name : typeof error}`,
      );
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message:
          'El almacenamiento no está disponible en este momento. Intenta de nuevo en unos minutos.',
      });
    }
  }

  private async reject(
    file: StoredFile,
    actor: Actor,
    now: Date,
    reason: Exclude<FileRejectReason, 'MISSING_OBJECT'>,
    data: { sizeBytes: number | null; sha256: string | null },
  ): Promise<never> {
    const updated = await this.prisma.storedFile.updateMany({
      where: { id: file.id, uploadStatus: 'PENDING' },
      data: {
        uploadStatus: 'COMPLETED',
        scanStatus: reason === 'INFECTED' ? 'INFECTED' : 'INVALID',
        rejectReason: reason,
        sizeBytes: data.sizeBytes,
        sha256: data.sha256,
        completedAt: now,
        scannedAt: new Date(),
      },
    });
    await this.safeDelete(file.objectKey, file.id);

    if (updated.count > 0) {
      await recordFiles(this.audit, actor, 'upload.rejected', file.id, {
        purpose: file.purpose,
        courseSectionId: file.courseSectionId,
        assignmentId: file.assignmentId,
        reason,
      });
      if (file.purpose === 'SUBMISSION' && file.assignmentId) {
        this.events.publish({
          type: 'submission.rejected.v1',
          payload: {
            uploadId: file.id,
            assignmentId: file.assignmentId,
            courseSectionId: file.courseSectionId,
            studentId: file.uploadedById,
            reason,
            rejectedAt: now.toISOString(),
          },
        });
      }
    }
    throw rejection(reason, file.maxBytes);
  }

  /** Intención vencida o ya no permitida: queda EXPIRED y se borra lo que se haya subido. */
  private async expire(
    file: StoredFile,
    actor: Actor,
    reason: 'MISSING_OBJECT' | null,
  ): Promise<void> {
    const updated = await this.prisma.storedFile.updateMany({
      where: { id: file.id, uploadStatus: 'PENDING' },
      data: {
        uploadStatus: 'EXPIRED',
        ...(reason ? { scanStatus: 'INVALID' as const, rejectReason: reason } : {}),
      },
    });
    await this.safeDelete(file.objectKey, file.id);
    if (updated.count > 0) {
      await recordFiles(this.audit, actor, 'upload.expired', file.id, {
        purpose: file.purpose,
        courseSectionId: file.courseSectionId,
        assignmentId: file.assignmentId,
        reason,
      });
    }
  }

  private async safeDelete(key: string, fileId: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      // Queda en incoming/ (o huérfano) y lo limpia la regla de ciclo de vida o la purga.
      this.logger.warn(
        `No se pudo borrar el objeto del archivo ${fileId}: ${error instanceof Error ? error.name : typeof error}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // POST /files/:id/download-url

  async createDownloadUrl(
    user: AuthenticatedUser,
    fileId: string,
    dto: DownloadUrlDto,
    actor: Actor,
  ): Promise<DownloadUrlResponse> {
    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      include: {
        material: { select: { deletedAt: true } },
        attachedToAssignment: { select: { deletedAt: true } },
      },
    });
    // Un archivo pendiente, rechazado o purgado no se descarga nunca (RF-40, RNF-03).
    if (!file || file.scanStatus !== 'CLEAN' || file.purgedAt !== null) {
      throw new NotFoundException(NOT_FOUND);
    }

    await this.assertCanDownload(user, file);

    const signed = await this.storage.createDownloadUrl(file.objectKey, {
      fileName: file.originalName,
      inline: dto.inline ?? false,
    });

    await recordFiles(this.audit, actor, 'download-url.issued', file.id, {
      purpose: file.purpose,
      courseSectionId: file.courseSectionId,
      inline: dto.inline ?? false,
    });

    return { url: signed.url, method: 'GET', expiresAt: signed.expiresAt };
  }

  private async assertCanDownload(
    user: AuthenticatedUser,
    file: StoredFile & {
      material: { deletedAt: Date | null } | null;
      attachedToAssignment: { deletedAt: Date | null } | null;
    },
  ): Promise<void> {
    // El apoderado ve estados, no archivos privados (docs/05; decisión 4 del expediente).
    if (user.role === 'GUARDIAN') throw new ForbiddenException(NO_PERMISSION);

    if (file.purpose === 'SUBMISSION') {
      if (user.id === file.uploadedById) return this.assertActive(user.id);
      if (user.role === 'TEACHER')
        return this.access.assertTeacherOf(user.id, file.courseSectionId);
      if (user.role === 'ADMIN') {
        return this.access.assertCanAccessCourseSection(user, file.courseSectionId);
      }
      throw new ForbiddenException(NO_PERMISSION);
    }

    // MATERIAL o ASSIGNMENT_ATTACHMENT.
    const owner = file.material ?? file.attachedToAssignment;
    if (!owner) {
      // Aún no publicado: solo quien lo subió (y sigue siendo miembro) o un ADMIN.
      if (user.id !== file.uploadedById && user.role !== 'ADMIN') {
        throw new ForbiddenException(NO_PERMISSION);
      }
      return this.access.assertCanAccessCourseSection(user, file.courseSectionId);
    }
    if (owner.deletedAt !== null && user.role === 'STUDENT') {
      // En la papelera: el estudiante ya no lo ve.
      throw new NotFoundException(NOT_FOUND);
    }
    return this.access.assertCanAccessCourseSection(user, file.courseSectionId);
  }

  // ---------------------------------------------------------------------------
  // Permisos de subida (intent y complete)

  private async assertCanUpload(
    user: AuthenticatedUser,
    target: UploadTarget,
    now: Date,
  ): Promise<{ maxBytes: number }> {
    if (target.purpose !== 'SUBMISSION') {
      // MATERIAL y ASSIGNMENT_ATTACHMENT: el docente asignado o ADMIN, con el curso escribible.
      if (user.role === 'TEACHER') {
        await this.access.assertTeacherOf(user.id, target.courseSectionId);
      } else if (user.role === 'ADMIN') {
        await this.access.assertCanAccessCourseSection(user, target.courseSectionId);
      } else {
        throw new ForbiddenException(NO_PERMISSION);
      }
      await this.access.assertCourseSectionWritable(target.courseSectionId);
      return { maxBytes: ABSOLUTE_MAX_SIZE_BYTES };
    }

    // SUBMISSION: solo el estudiante, con matrícula vigente en la sección de la tarea.
    if (user.role !== 'STUDENT') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Solo el estudiante puede entregar sus tareas',
      });
    }
    await this.access.assertCanAccessCourseSection(user, target.courseSectionId);
    const assignment = target.assignmentId
      ? await this.prisma.assignment.findUnique({
          where: { id: target.assignmentId },
          select: {
            courseSectionId: true,
            periodId: true,
            dueAt: true,
            allowLate: true,
            maxSizeBytes: true,
            deletedAt: true,
            courseSection: { select: { section: { select: { level: true } } } },
          },
        })
      : null;
    if (
      !assignment ||
      assignment.deletedAt !== null ||
      assignment.courseSectionId !== target.courseSectionId
    ) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'La tarea no existe' });
    }
    // INICIAL: actividades sin entrega (409 NO_SUBMISSIONS_IN_LEVEL).
    assertSubmissionsAllowed(assignment.courseSection?.section.level);
    // Período cerrado bloquea entregas (decisión 2 del usuario), también las tardías.
    await this.access.assertCourseSectionWritable(target.courseSectionId, assignment.periodId);
    if (now.getTime() > assignment.dueAt.getTime() && !assignment.allowLate) {
      throw new ConflictException({
        code: 'DEADLINE_PASSED',
        message: 'La fecha límite de la tarea ya pasó y no admite entregas tardías',
      });
    }
    return { maxBytes: this.storage.effectiveMaxSize(assignment.maxSizeBytes) };
  }

  private async assertActive(userId: string): Promise<void> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (found?.status !== 'ACTIVE') throw new ForbiddenException(NO_PERMISSION);
  }
}

// -----------------------------------------------------------------------------

const NO_PERMISSION = { code: 'FORBIDDEN', message: 'No tienes permiso para este archivo' };

function validation(path: string, message: string): BadRequestException {
  return new BadRequestException({ message: [{ path, message }] });
}

function tooLarge(maxBytes: number): PayloadTooLargeException {
  const mb = Math.round((maxBytes / BYTES_PER_MB) * 100) / 100;
  return new PayloadTooLargeException({
    code: 'FILE_TOO_LARGE',
    message: `El archivo supera el límite de ${mb} MB`,
  });
}

function expired(): ConflictException {
  return new ConflictException({
    code: 'UPLOAD_EXPIRED',
    message: 'La subida venció. Vuelve a seleccionar el archivo',
  });
}

/** Error HTTP de cada motivo de rechazo (docs/03: 413, 415, 422). */
export function rejection(reason: FileRejectReason, maxBytes: number): HttpException {
  switch (reason) {
    case 'TOO_LARGE':
      return tooLarge(maxBytes);
    case 'NOT_PDF':
      return new UnsupportedMediaTypeException({
        code: 'INVALID_PDF',
        message: 'El archivo no es un PDF válido',
      });
    case 'ENCRYPTED_PDF':
      return new UnsupportedMediaTypeException({
        code: 'ENCRYPTED_PDF',
        message: 'El PDF está protegido con contraseña. Sube una versión sin protección',
      });
    case 'INFECTED':
      return new UnprocessableEntityException({
        code: 'FILE_INFECTED',
        message: 'El antivirus bloqueó el archivo. No se guardó',
      });
    case 'MISSING_OBJECT':
      return expired();
    default:
      return new HttpException(NOT_FOUND, HttpStatus.NOT_FOUND);
  }
}

/** Respuesta repetida de un complete ya resuelto (idempotencia). */
function replay(file: StoredFile): CompleteResponse {
  if (file.scanStatus === 'CLEAN' && file.sizeBytes !== null && file.sha256 !== null) {
    return {
      fileId: file.id,
      scanStatus: 'CLEAN',
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      completedAt: (file.completedAt ?? file.updatedAt).toISOString(),
    };
  }
  if (file.rejectReason) throw rejection(file.rejectReason, file.maxBytes);
  throw expired();
}
