import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { FileLifecycleService } from '../../files/file-lifecycle.service.js';
import {
  BackgroundJobService,
  JobError,
  JobProcessorRegistry,
  type JobProcessor,
  JobResultStorage,
  type StartedJob,
  type TrackedJobData,
  TrackedJobRunner,
} from '../../jobs/index.js';
import { recordLifecycle } from '../lifecycle-audit.js';
import { LifecycleService } from '../lifecycle.service.js';

/** Archivos por lote (cursor por id: los reutilizables saltados no se vuelven a leer). */
export const PURGE_FILE_BATCH = 200;
/** Ids por DELETE de Notification (IN acotado). */
const NOTIFICATION_CHUNK = 500;

export interface PurgeCounts {
  purged: number;
  alreadyPurged: number;
  skippedReusable: number;
  notificationsDeleted: number;
  backupsDeleted: number;
  /** PDF del año que no entraron en los respaldos (infectados o sin confirmar). */
  excludedFromBackup: number;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * lifecycle:purge-year (RF-66, U6, U7; seguridad 5b, hallazgo 4). Irreversible. Antes de tocar
 * nada vuelve a comprobar las precondiciones (año cerrado, todas las secciones con respaldo
 * SUCCEEDED que sigue en S3 con más de 0 bytes y closedAt + purgeAfterDays cumplido): si no se cumplen, falla sin reintentos con
 * PURGE_NOT_ELIGIBLE. Luego, en este orden y de forma idempotente:
 *   1. FileLifecycleService.purge (Dev 3) sobre cada StoredFile del año sin purgar; los
 *      Material isReusable se saltan (RN-14, regla H). Las filas, notas, logros del período
 *      (PeriodAchievement) y bitácora se conservan (RN-14): ninguna Notification apunta a un logro.
 *   2. Borra las Notification del año (las que apuntan a sus tareas, notas o anuncios).
 *   3. Borra los ZIP de respaldo del año (U6) y los marca EXPIRED.
 *   4. Bitácora lifecycle.purge con los conteos.
 * Si S3 falla a mitad, lanza y BullMQ reintenta: lo ya purgado da ALREADY_PURGED.
 */
@Injectable()
export class PurgeYearProcessor implements JobProcessor<TrackedJobData>, OnModuleInit {
  readonly queue = 'lifecycle' as const;
  readonly name = 'purge-year';

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly runner: TrackedJobRunner,
    private readonly prisma: PrismaService,
    private readonly files: FileLifecycleService,
    private readonly jobs: BackgroundJobService,
    private readonly lifecycle: LifecycleService,
    private readonly audit: AuditService,
    private readonly results: JobResultStorage,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  handle(job: Job<TrackedJobData>): Promise<void> {
    return this.runner.run(job, async (started) => {
      await this.work(started);
      return null;
    });
  }

  async work(started: StartedJob, now: Date = new Date()): Promise<PurgeCounts> {
    const academicYearId = started.params.academicYearId;
    if (typeof academicYearId !== 'string') throw new JobError('INVALID_PARAMS', false);
    const status = await this.lifecycle.purgeStatusOf(academicYearId, now);
    if (!status) throw new JobError('YEAR_NOT_FOUND', false);
    if (status.state !== 'ELIGIBLE') throw new JobError('PURGE_NOT_ELIGIBLE', false);
    await this.assertBackupsPresent(academicYearId);

    const counts: PurgeCounts = {
      purged: 0,
      alreadyPurged: 0,
      skippedReusable: 0,
      notificationsDeleted: 0,
      backupsDeleted: 0,
      excludedFromBackup: await this.countExcluded(academicYearId),
    };
    await this.purgeFiles(academicYearId, counts);
    counts.notificationsDeleted = await this.deleteNotifications(academicYearId);
    counts.backupsDeleted = await this.jobs.expireYearBackups(academicYearId, now);
    await recordLifecycle(
      this.audit,
      null,
      'lifecycle.purge',
      { type: 'AcademicYear', id: academicYearId },
      { jobId: started.id, ...counts, eligibleAt: status.eligibleAt?.toISOString() ?? null },
    );
    return counts;
  }

  /**
   * Seguridad 5g: cada respaldo SUCCEEDED del año debe seguir en S3 con más de 0 bytes. Si falta
   * uno, no se purga (PURGE_NOT_ELIGIBLE, sin reintentos). Los EXPIRED ya los borró un intento
   * anterior de esta misma purga y no se comprueban.
   */
  private async assertBackupsPresent(academicYearId: string): Promise<void> {
    const rows = await this.prisma.backgroundJob.findMany({
      where: { academicYearId, type: 'YEAR_BACKUP', status: 'SUCCEEDED' },
      select: { resultObjectKey: true },
    });
    for (const row of rows) {
      const size = row.resultObjectKey ? await this.results.size(row.resultObjectKey) : null;
      if (!size) throw new JobError('PURGE_NOT_ELIGIBLE', false);
    }
  }

  /** Archivos del año sin purgar que el respaldo no copió (no CLEAN o no COMPLETED). */
  private countExcluded(academicYearId: string): Promise<number> {
    return this.prisma.storedFile.count({
      where: {
        purgedAt: null,
        courseSection: { section: { academicYearId } },
        OR: [{ scanStatus: { not: 'CLEAN' } }, { uploadStatus: { not: 'COMPLETED' } }],
      },
    });
  }

  private async purgeFiles(academicYearId: string, counts: PurgeCounts): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.storedFile.findMany({
        where: {
          purgedAt: null,
          courseSection: { section: { academicYearId } },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PURGE_FILE_BATCH,
      });
      if (batch.length === 0) return;
      for (const { id } of batch) {
        const result = await this.files.purge(id, null);
        if (result === 'PURGED') counts.purged++;
        else if (result === 'ALREADY_PURGED') counts.alreadyPurged++;
        else counts.skippedReusable++;
      }
      cursor = batch[batch.length - 1].id;
    }
  }

  /**
   * Notification no tiene año: entityId apunta a una tarea, una nota o un anuncio (docs/02). Se
   * borran las que apuntan a entidades del año (los uuid no se repiten entre tablas).
   */
  private async deleteNotifications(academicYearId: string): Promise<number> {
    const [assignments, grades, announcements] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { courseSection: { section: { academicYearId } } },
        select: { id: true },
      }),
      this.prisma.grade.findMany({
        where: { enrollment: { academicYearId } },
        select: { id: true },
      }),
      this.prisma.announcement.findMany({ where: { academicYearId }, select: { id: true } }),
    ]);
    const ids = [...assignments, ...grades, ...announcements].map((r) => r.id);
    let deleted = 0;
    for (const part of chunks(ids, NOTIFICATION_CHUNK)) {
      const { count } = await this.prisma.notification.deleteMany({
        where: { entityId: { in: part } },
      });
      deleted += count;
    }
    return deleted;
  }
}
