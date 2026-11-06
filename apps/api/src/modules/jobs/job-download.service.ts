import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Actor } from '../academic/request-user.js';
import type { SignedUrl } from '../storage/index.js';
import { BackgroundJobService } from './background-job.service.js';
import type { JobActor, JobType, JobView } from './jobs.types.js';

const logger = new Logger('JobsAudit');

/** Tipos cuya descarga exige bitácora previa (datos personales, RF-63, y respaldos, RF-65). */
const AUDIT_FIRST = new Set<JobType>(['PERSONAL_DATA_EXPORT', 'YEAR_BACKUP']);

/** Nombre base del archivo descargado por tipo (sin datos personales; la extension la pone S3). */
const BASE_NAME: Record<JobType, string> = {
  SECTION_EXPORT: 'reporte-seccion',
  BULK_EXPORT: 'exportacion',
  PERSONAL_DATA_EXPORT: 'datos-personales',
  YEAR_BACKUP: 'respaldo',
  PURGE_YEAR: 'purga',
};

/**
 * Consulta y descarga de trabajos desde la web (GET /admin/jobs/:id y
 * POST /admin/jobs/:id/download-url). Toda descarga deja bitacora `job.download` con el id, el
 * tipo y el actor (seguridad 5b, hallazgo 3; Decision 8): incluye la del PERSONAL_DATA_EXPORT
 * que descarga el ADMIN para atender un pedido ARCO.
 */
@Injectable()
export class JobDownloadService {
  constructor(
    private readonly jobs: BackgroundJobService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  find(id: string, actor: JobActor): Promise<JobView> {
    return this.jobs.findForActor(id, actor);
  }

  async downloadUrl(id: string, actor: JobActor & Actor): Promise<SignedUrl> {
    const view = await this.jobs.findForActor(id, actor);
    const fileName = await this.fileName(view);
    if (!AUDIT_FIRST.has(view.type)) {
      const url = await this.jobs.createDownloadUrl(id, actor, fileName);
      await this.record(actor, view);
      return url;
    }
    // Datos personales y respaldos (seguridad 5g): sin rastro en la bitácora no hay URL. Se
    // comprueba antes que el resultado esté listo, para no registrar descargas imposibles.
    if (view.status !== 'SUCCEEDED' || !view.hasResult) {
      return this.jobs.createDownloadUrl(id, actor, fileName); // lanza 409/410
    }
    try {
      await this.write(actor, view);
    } catch (error: unknown) {
      this.logFailure(actor, error);
      throw new ServiceUnavailableException({
        code: 'AUDIT_UNAVAILABLE',
        message: 'No se pudo registrar la descarga. Intenta más tarde.',
      });
    }
    return this.jobs.createDownloadUrl(id, actor, fileName);
  }

  /** p. ej. respaldo-2026-3A-2026-12-20, datos-personales-2026-10-30. */
  private async fileName(view: JobView): Promise<string> {
    const day = view.createdAt.slice(0, 10);
    if (view.type !== 'YEAR_BACKUP') return `${BASE_NAME[view.type]}-${day}`;
    const row = await this.prisma.backgroundJob.findUnique({
      where: { id: view.id },
      select: { params: true },
    });
    const params = (row?.params ?? {}) as Record<string, unknown>;
    const sectionId = typeof params.sectionId === 'string' ? params.sectionId : null;
    const section = sectionId
      ? await this.prisma.section.findUnique({
          where: { id: sectionId },
          select: { gradeLevel: true, code: true, academicYear: { select: { year: true } } },
        })
      : null;
    if (!section) return `${BASE_NAME.YEAR_BACKUP}-${day}`;
    return `${BASE_NAME.YEAR_BACKUP}-${section.academicYear.year}-${section.gradeLevel}${section.code}`;
  }

  /** Despues de firmar la URL; nunca lanza (la URL ya se emitio). */
  private async record(actor: Actor, view: JobView): Promise<void> {
    try {
      await this.write(actor, view);
    } catch (error: unknown) {
      this.logFailure(actor, error);
    }
  }

  private write(actor: Actor, view: JobView): Promise<void> {
    return this.audit.record({
      actorId: actor.id,
      ip: actor.ip,
      module: 'jobs',
      action: 'job.download',
      entityType: 'BackgroundJob',
      entityId: view.id,
      afterState: { jobId: view.id, type: view.type },
    });
  }

  private logFailure(actor: Actor, error: unknown): void {
    logger.error(
      `Fallo al registrar la bitácora: ${JSON.stringify({
        action: 'job.download',
        actorId: actor.id,
        error: error instanceof Error ? error.name : typeof error,
      })}`,
    );
  }
}
