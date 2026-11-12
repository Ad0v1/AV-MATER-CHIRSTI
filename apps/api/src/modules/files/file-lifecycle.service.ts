import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { StorageService } from '../storage/index.js';
import { recordFiles } from './files-audit.js';

// Ciclo de vida de StoredFile (Dev 3, stub autorizado U12 del 30/10/2026) para los barridos y la
// purga de Dev 5 (RF-62..67, RNF-03/18). Sin HTTP: lo llaman los procesadores del worker.
//   - expireIntents: intents PENDING vencidos (más un margen) → EXPIRED y se borra incoming/.
//   - purge: borra el objeto y marca purgedAt; la fila se conserva. Nunca un Material reutilizable.
// Ambos son idempotentes y escriben bitácora sin datos personales (actor null = sistema).

/**
 * Margen tras intentExpiresAt antes de barrer: complete() acepta un objeto subido a tiempo aunque
 * la URL ya haya vencido, así que no se barre a quien está confirmando justo en el límite.
 */
export const INTENT_SWEEP_GRACE_MS = 15 * 60 * 1000;

/** Tamaño de lote del barrido (cada corrida procesa como máximo esto; la siguiente sigue). */
export const INTENT_SWEEP_BATCH = 500;

export type PurgeResult = 'PURGED' | 'ALREADY_PURGED' | 'SKIPPED_REUSABLE';

@Injectable()
export class FileLifecycleService {
  private readonly logger = new Logger('FileLifecycle');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Marca EXPIRED los intents PENDING cuyo intentExpiresAt + margen ya pasó y borra su objeto de
   * incoming/. Devuelve cuántos pasó a EXPIRED en esta corrida (0 si se repite: idempotente).
   */
  async expireIntents(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - INTENT_SWEEP_GRACE_MS);
    const candidates = await this.prisma.storedFile.findMany({
      where: { uploadStatus: 'PENDING', intentExpiresAt: { lt: cutoff } },
      select: {
        id: true,
        objectKey: true,
        purpose: true,
        courseSectionId: true,
        assignmentId: true,
      },
      orderBy: { intentExpiresAt: 'asc' },
      take: INTENT_SWEEP_BATCH,
    });

    let processed = 0;
    for (const file of candidates) {
      // Guarda optimista: si un complete() concurrente lo aceptó, no se toca.
      const updated = await this.prisma.storedFile.updateMany({
        where: { id: file.id, uploadStatus: 'PENDING', intentExpiresAt: { lt: cutoff } },
        data: { uploadStatus: 'EXPIRED' },
      });
      if (updated.count === 0) continue;
      processed += 1;

      if (file.objectKey.startsWith('incoming/')) {
        await this.safeDelete(file.objectKey, file.id);
      }
      await recordFiles(this.audit, null, 'upload.expired', file.id, {
        purpose: file.purpose,
        courseSectionId: file.courseSectionId,
        assignmentId: file.assignmentId,
        reason: 'SWEEP',
      });
    }
    return processed;
  }

  /**
   * Purga un archivo: borra el objeto y marca purgedAt. No purga si está ligado a un Material
   * isReusable. Si S3 falla, lanza (el job reintenta); borrar un objeto ausente no es error.
   * 404 FILE_NOT_FOUND si el archivo no existe.
   */
  async purge(fileId: string, actorId: string | null): Promise<PurgeResult> {
    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        objectKey: true,
        purpose: true,
        courseSectionId: true,
        assignmentId: true,
        purgedAt: true,
        material: { select: { isReusable: true } },
      },
    });
    if (!file) {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'El archivo no existe' });
    }
    if (file.purgedAt) return 'ALREADY_PURGED';
    if (file.material?.isReusable) return 'SKIPPED_REUSABLE';

    // Primero el objeto y después la marca: si la marca falla, reintentar vuelve a borrar sin daño.
    await this.storage.deleteObject(file.objectKey);

    const purgedAt = new Date();
    const updated = await this.prisma.storedFile.updateMany({
      where: { id: file.id, purgedAt: null },
      data: { purgedAt },
    });
    if (updated.count === 0) return 'ALREADY_PURGED';

    await recordFiles(this.audit, actorId ? { id: actorId } : null, 'file.purge', file.id, {
      purpose: file.purpose,
      courseSectionId: file.courseSectionId,
      assignmentId: file.assignmentId,
      purgedAt: purgedAt.toISOString(),
    });
    return 'PURGED';
  }

  private async safeDelete(key: string, fileId: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      // Queda en incoming/ y lo limpia la regla de ciclo de vida del bucket.
      this.logger.warn(
        `No se pudo borrar el objeto del intent ${fileId}: ${error instanceof Error ? error.name : typeof error}`,
      );
    }
  }
}
