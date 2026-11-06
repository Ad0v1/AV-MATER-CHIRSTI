import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../academic/request-user.js';
import {
  BackgroundJobService,
  type JobRow,
  jobRowSelect,
  type JobView,
  toJobView,
} from '../jobs/index.js';
import { recordLifecycle } from './lifecycle-audit.js';
import {
  type BackupRowLite,
  latestBackupBySection,
  type PurgeState,
  purgeStatus,
  type PurgeStatus,
  sectionsNeedingBackup,
} from './lifecycle.policy.js';

/** Plazo por defecto si faltara la fila de configuración (ERS §8, D-015). */
const DEFAULT_PURGE_AFTER_DAYS = 60;

export interface UsageBucket {
  bytes: number;
  files: number;
}

/** RF-67: uso del almacenamiento (StoredFile sin purgar) por año, grado y curso. */
export interface StorageUsageView {
  academicYearId: string | null;
  total: UsageBucket;
  years: Array<
    UsageBucket & {
      academicYearId: string;
      year: number;
      closedAt: string | null;
      /** Tamaño de los respaldos anuales vigentes (backups/, U6). */
      backupBytes: number;
    }
  >;
  grades: Array<UsageBucket & { academicYearId: string; gradeLevel: number }>;
  courses: Array<
    UsageBucket & {
      academicYearId: string;
      gradeLevel: number;
      courseId: string;
      courseName: string;
    }
  >;
}

export interface YearBackupsView {
  academicYear: { id: string; year: number; closedAt: string | null };
  purge: {
    state: PurgeState;
    purgeAfterDays: number;
    eligibleAt: string | null;
    purgedAt: string | null;
    sectionsTotal: number;
    sectionsBackedUp: number;
    /** Último PURGE_YEAR del año (en curso, fallido o terminado). */
    job: JobView | null;
  };
  sections: Array<{ sectionId: string; gradeLevel: number; code: string; backup: JobView | null }>;
}

type BackupRow = JobRow & BackupRowLite;

type RawUsage = {
  academicYearId: string;
  gradeLevel: number | bigint;
  courseId: string;
  courseName: string;
  files: number | bigint;
  bytes: number | bigint | string | null;
};

const yearNotFound = () =>
  new NotFoundException({ code: 'YEAR_NOT_FOUND', message: 'El año escolar no existe.' });

const num = (v: number | bigint | string | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

/**
 * Ciclo de vida del año y datos personales (Dev 5, RF-63, RF-65..67, U6, U7). Lo usan la API
 * (solicitudes, listados, listener del cierre de año) y el worker (barrido diario y purga).
 * Nunca recalcula notas ni toca contenidos: solo crea BackgroundJob y lee.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: BackgroundJobService,
    private readonly audit: AuditService,
  ) {}

  // --- RF-63: datos personales ------------------------------------------------------------

  /** 202: crea un PERSONAL_DATA_EXPORT del estudiante. 404 si el id no es de un estudiante. */
  async requestPersonalDataExport(studentId: string, actor: Actor): Promise<JobView> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { role: true },
    });
    if (user?.role !== 'STUDENT') {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'El estudiante no existe.',
      });
    }
    const job = await this.jobs.create({
      type: 'PERSONAL_DATA_EXPORT',
      params: { studentId },
      requestedById: actor.id,
    });
    await recordLifecycle(
      this.audit,
      actor,
      'lifecycle.personal_data_export.request',
      { type: 'User', id: studentId },
      { jobId: job.id },
    );
    return job;
  }

  // --- RF-65/66: respaldos y purga --------------------------------------------------------

  async purgeAfterDays(): Promise<number> {
    const row = await this.prisma.institutionSettings.findUnique({
      where: { id: 1 },
      select: { purgeAfterDays: true },
    });
    return row?.purgeAfterDays ?? DEFAULT_PURGE_AFTER_DAYS;
  }

  /** Estado de la purga del año (U7). null si el año no existe. */
  async purgeStatusOf(academicYearId: string, now: Date = new Date()): Promise<PurgeStatus | null> {
    const state = await this.loadYearState(academicYearId);
    if (!state) return null;
    return purgeStatus({ ...state.policyInput, now });
  }

  /**
   * Encola un YEAR_BACKUP (sistema) por cada sección del año cerrado que no tiene respaldo o
   * cuyo último respaldo falló. Idempotente: no repite los QUEUED, RUNNING o SUCCEEDED. Lo
   * llaman el listener de academic-year.closed.v1 y el barrido diario. Devuelve los creados.
   */
  async ensureYearBackups(academicYearId: string): Promise<JobView[]> {
    const state = await this.loadYearState(academicYearId);
    if (!state?.year.closedAt || state.purgedAt) return [];
    const missing = sectionsNeedingBackup(state.policyInput.sectionIds, state.backups);
    const created: JobView[] = [];
    for (const sectionId of missing) {
      try {
        created.push(
          await this.jobs.create({
            type: 'YEAR_BACKUP',
            params: { academicYearId, sectionId },
            requestedById: null,
          }),
        );
      } catch (error) {
        // Otro proceso lo encoló entretanto (409): no es error.
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    if (created.length > 0) {
      await recordLifecycle(
        this.audit,
        null,
        'lifecycle.backup.enqueue',
        { type: 'AcademicYear', id: academicYearId },
        { sections: created.length },
      );
    }
    return created;
  }

  /** Encola el PURGE_YEAR (sistema) si el año es elegible (U7). null si no corresponde. */
  async enqueuePurgeIfEligible(academicYearId: string, now: Date = new Date()) {
    const status = await this.purgeStatusOf(academicYearId, now);
    if (status?.state !== 'ELIGIBLE') return null;
    try {
      const job = await this.jobs.create({
        type: 'PURGE_YEAR',
        params: { academicYearId },
        requestedById: null,
      });
      await recordLifecycle(
        this.audit,
        null,
        'lifecycle.purge.enqueue',
        { type: 'AcademicYear', id: academicYearId },
        { jobId: job.id, eligibleAt: status.eligibleAt?.toISOString() ?? null },
      );
      return job;
    } catch (error) {
      if (error instanceof ConflictException) return null;
      throw error;
    }
  }

  /**
   * Barrido diario (maintenance:lifecycle-sweep): en cada año cerrado sin purgar, completa los
   * respaldos que falten y encola la purga elegible. Un año que falla no corta a los demás.
   */
  async sweep(now: Date = new Date()): Promise<{ backups: number; purges: number }> {
    const years = await this.prisma.academicYear.findMany({
      where: { closedAt: { not: null } },
      select: { id: true },
      orderBy: { year: 'asc' },
    });
    let backups = 0;
    let purges = 0;
    for (const { id } of years) {
      try {
        backups += (await this.ensureYearBackups(id)).length;
        if (await this.enqueuePurgeIfEligible(id, now)) purges++;
      } catch (error) {
        this.logger.warn(`Barrido del año ${id}: ${error instanceof Error ? error.name : 'error'}`);
      }
    }
    return { backups, purges };
  }

  /** GET /admin/academic-years/:id/backups: respaldo vigente por sección y estado de la purga. */
  async listBackups(academicYearId: string, now: Date = new Date()): Promise<YearBackupsView> {
    const state = await this.loadYearState(academicYearId);
    if (!state) throw yearNotFound();
    const status = purgeStatus({ ...state.policyInput, now });
    const latest = latestBackupBySection(state.backups);
    return {
      academicYear: {
        id: state.year.id,
        year: state.year.year,
        closedAt: state.year.closedAt?.toISOString() ?? null,
      },
      purge: {
        state: status.state,
        purgeAfterDays: state.policyInput.purgeAfterDays,
        eligibleAt: status.eligibleAt?.toISOString() ?? null,
        purgedAt: state.purgedAt?.toISOString() ?? null,
        sectionsTotal: status.sectionsTotal,
        sectionsBackedUp: status.sectionsBackedUp,
        job: state.lastPurge ? toJobView(state.lastPurge) : null,
      },
      sections: state.sections.map((s) => {
        const backup = latest.get(s.id);
        return {
          sectionId: s.id,
          gradeLevel: s.gradeLevel,
          code: s.code,
          backup: backup ? toJobView(backup) : null,
        };
      }),
    };
  }

  // --- RF-67: uso del almacenamiento ------------------------------------------------------

  async storageUsage(academicYearId?: string): Promise<StorageUsageView> {
    const years = await this.prisma.academicYear.findMany({
      where: academicYearId ? { id: academicYearId } : {},
      select: { id: true, year: true, closedAt: true },
      orderBy: { year: 'desc' },
    });
    if (academicYearId && years.length === 0) throw yearNotFound();
    const filter = academicYearId
      ? Prisma.sql`AND s.academicYearId = ${academicYearId}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawUsage[]>`
      SELECT s.academicYearId AS academicYearId, s.gradeLevel AS gradeLevel,
             c.id AS courseId, c.name AS courseName,
             COUNT(*) AS files, COALESCE(SUM(f.sizeBytes), 0) AS bytes
      FROM StoredFile f
      JOIN CourseSection cs ON cs.id = f.courseSectionId
      JOIN Section s ON s.id = cs.sectionId
      JOIN Course c ON c.id = cs.courseId
      WHERE f.purgedAt IS NULL AND f.sizeBytes IS NOT NULL ${filter}
      GROUP BY s.academicYearId, s.gradeLevel, c.id, c.name
      ORDER BY s.gradeLevel, c.name`;
    const backupSums = await this.prisma.backgroundJob.groupBy({
      by: ['academicYearId'],
      where: {
        type: 'YEAR_BACKUP',
        status: 'SUCCEEDED',
        ...(academicYearId ? { academicYearId } : { academicYearId: { not: null } }),
      },
      _sum: { resultBytes: true },
    });

    const courses = rows.map((r) => ({
      academicYearId: r.academicYearId,
      gradeLevel: num(r.gradeLevel),
      courseId: r.courseId,
      courseName: r.courseName,
      bytes: num(r.bytes),
      files: num(r.files),
    }));
    const gradeMap = new Map<string, StorageUsageView['grades'][number]>();
    const yearTotals = new Map<string, UsageBucket>();
    for (const c of courses) {
      const key = `${c.academicYearId}:${c.gradeLevel}`;
      const g = gradeMap.get(key) ?? {
        academicYearId: c.academicYearId,
        gradeLevel: c.gradeLevel,
        bytes: 0,
        files: 0,
      };
      g.bytes += c.bytes;
      g.files += c.files;
      gradeMap.set(key, g);
      const y = yearTotals.get(c.academicYearId) ?? { bytes: 0, files: 0 };
      y.bytes += c.bytes;
      y.files += c.files;
      yearTotals.set(c.academicYearId, y);
    }
    const backupBytes = new Map(
      backupSums.map((b) => [b.academicYearId ?? '', num(b._sum.resultBytes)]),
    );
    const yearViews = years.map((y) => ({
      academicYearId: y.id,
      year: y.year,
      closedAt: y.closedAt?.toISOString() ?? null,
      ...(yearTotals.get(y.id) ?? { bytes: 0, files: 0 }),
      backupBytes: backupBytes.get(y.id) ?? 0,
    }));
    return {
      academicYearId: academicYearId ?? null,
      total: yearViews.reduce(
        (acc, y) => ({ bytes: acc.bytes + y.bytes, files: acc.files + y.files }),
        { bytes: 0, files: 0 },
      ),
      years: yearViews,
      grades: [...gradeMap.values()].sort(
        (a, b) => a.academicYearId.localeCompare(b.academicYearId) || a.gradeLevel - b.gradeLevel,
      ),
      courses,
    };
  }

  // --- Lectura común ----------------------------------------------------------------------

  private async loadYearState(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, year: true, closedAt: true },
    });
    if (!year) return null;
    const [sections, jobRows, purgeAfterDays] = await Promise.all([
      this.prisma.section.findMany({
        where: { academicYearId },
        select: { id: true, gradeLevel: true, code: true },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.backgroundJob.findMany({
        where: { academicYearId, type: { in: ['YEAR_BACKUP', 'PURGE_YEAR'] } },
        select: { ...jobRowSelect, params: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.purgeAfterDays(),
    ]);
    const backups: BackupRow[] = jobRows
      .filter((r) => r.type === 'YEAR_BACKUP')
      .map(({ params, ...r }) => ({ ...r, sectionId: sectionIdOf(params) }));
    const purges = jobRows.filter((r) => r.type === 'PURGE_YEAR');
    const purged = purges.filter((r) => r.status === 'SUCCEEDED').at(-1);
    const purgedAt = purged ? (purged.finishedAt ?? purged.createdAt) : null;
    const lastPurge = purges.at(-1) ?? null;
    return {
      year,
      sections,
      backups,
      purgedAt,
      lastPurge: lastPurge ? stripParams(lastPurge) : null,
      policyInput: {
        closedAt: year.closedAt,
        purgeAfterDays,
        sectionIds: sections.map((s) => s.id),
        backups,
        purgedAt,
      },
    };
  }
}

function sectionIdOf(params: unknown): string | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return null;
  const value = (params as Record<string, unknown>).sectionId;
  return typeof value === 'string' ? value : null;
}

function stripParams<T extends { params: unknown }>(row: T): Omit<T, 'params'> {
  const { params: _params, ...rest } = row;
  return rest;
}
