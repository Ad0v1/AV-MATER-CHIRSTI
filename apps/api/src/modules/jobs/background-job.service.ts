import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ENV, type Env } from '../../config/config.module.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { assertJobData, type JobData, QueueService } from '../queue/index.js';
import type { SignedUrl } from '../storage/index.js';
import { JobResultStorage } from './job-result.storage.js';
import { JOB_ROUTES, type JobActor, type JobType, type JobView } from './jobs.types.js';

// BackgroundJob (RNF-19, docs/02). Ciclo impuesto por el CHECK BackgroundJob_status_chk:
//   QUEUED -> RUNNING -> SUCCEEDED | FAILED;  QUEUED -> FAILED (no se pudo encolar);
//   RUNNING -> RUNNING (reintento);  SUCCEEDED -> EXPIRED (U6, se borra el objeto).
// Cada transicion es un updateMany condicionado al estado anterior: dos workers que compiten
// por el mismo trabajo no pueden saltarse el ciclo.

const ERROR_CODE = /^[A-Z0-9_]{1,64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRE_BATCH = 100;

type JobRow = {
  id: string;
  type: JobType;
  status: JobView['status'];
  requestedById: string | null;
  resultObjectKey: string | null;
  resultBytes: bigint | null;
  errorCode: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
};

const rowSelect = {
  id: true,
  type: true,
  status: true,
  requestedById: true,
  resultObjectKey: true,
  resultBytes: true,
  errorCode: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  expiresAt: true,
} as const;

export interface CreateJobInput {
  type: JobType;
  /** Solo ids (assertJobData). En YEAR_BACKUP y PURGE_YEAR debe llevar academicYearId. */
  params: JobData;
  /** null = lo lanzo el sistema. */
  requestedById: string | null;
}

export interface JobResult {
  objectKey: string;
  bytes: number;
}

/** Trabajo en curso que recibe el procesador al empezar. */
export interface StartedJob {
  id: string;
  type: JobType;
  params: JobData;
  attempts: number;
}

export function sanitizeErrorCode(code: string): string {
  return ERROR_CODE.test(code) ? code : 'INTERNAL_ERROR';
}

function toView(row: JobRow): JobView {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    errorCode: row.errorCode,
    resultBytes: row.resultBytes === null ? null : Number(row.resultBytes),
    hasResult: row.status === 'SUCCEEDED' && row.resultObjectKey !== null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

const notFound = () =>
  new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'El trabajo no existe.' });

@Injectable()
export class BackgroundJobService {
  private readonly logger = new Logger(BackgroundJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly results: JobResultStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Crea la fila QUEUED y encola el trabajo con jobId = id de la fila (idempotente). Si Redis no
   * responde, la fila pasa a FAILED con QUEUE_UNAVAILABLE y se responde 503.
   * Quien llama ya comprobo permisos y escribe la bitacora de la solicitud.
   */
  async create(input: CreateJobInput): Promise<JobView> {
    assertJobData(input.params);
    const route = JOB_ROUTES[input.type];
    const yearId = input.params.academicYearId;
    const academicYearId = typeof yearId === 'string' ? yearId : null;
    if ((input.type === 'YEAR_BACKUP' || input.type === 'PURGE_YEAR') && !academicYearId) {
      throw new Error(`${input.type} exige params.academicYearId`);
    }
    const row = await this.prisma.backgroundJob.create({
      data: {
        type: input.type,
        params: input.params as Prisma.InputJsonObject,
        academicYearId,
        requestedById: input.requestedById,
      },
      select: rowSelect,
    });
    try {
      await this.queues.enqueue(
        route.queue,
        route.name,
        { backgroundJobId: row.id },
        { jobId: row.id },
      );
    } catch (error) {
      this.logger.error(`No se pudo encolar el trabajo ${row.id}: ${describe(error)}`);
      await this.fail(row.id, 'QUEUE_UNAVAILABLE');
      throw new ServiceUnavailableException({
        code: 'QUEUE_UNAVAILABLE',
        message: 'No se pudo programar el trabajo. Intenta más tarde.',
      });
    }
    return toView(row);
  }

  /** El solicitante o un ADMIN. A otro usuario se le responde 404 para no revelar ids. */
  async findForActor(id: string, actor: JobActor): Promise<JobView> {
    return toView(await this.loadForActor(id, actor));
  }

  /** URL firmada de 60 s del resultado. 409 si aun no termina bien; 410 si ya vencio (U6). */
  async createDownloadUrl(
    id: string,
    actor: JobActor,
    fileName: string,
    now: Date = new Date(),
  ): Promise<SignedUrl> {
    const row = await this.loadForActor(id, actor);
    if (row.status === 'EXPIRED' || (row.expiresAt !== null && row.expiresAt <= now)) {
      throw new GoneException({ code: 'JOB_EXPIRED', message: 'El resultado ya venció.' });
    }
    if (row.status !== 'SUCCEEDED' || row.resultObjectKey === null) {
      throw new ConflictException({
        code: 'JOB_NOT_READY',
        message: 'El trabajo todavía no tiene un resultado.',
      });
    }
    return this.results.createDownloadUrl(row.resultObjectKey, fileName);
  }

  // --- Transiciones (solo el worker) ------------------------------------------------------

  /**
   * QUEUED -> RUNNING, o RUNNING -> RUNNING en un reintento. Devuelve null si la fila no existe
   * o ya termino: el procesador no hace nada (entrega al menos una vez, idempotente).
   */
  async start(id: string, now: Date = new Date()): Promise<StartedJob | null> {
    const { count } = await this.prisma.backgroundJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'RUNNING', startedAt: now, attempts: { increment: 1 } },
    });
    if (count === 0) return null;
    const row = await this.prisma.backgroundJob.findUnique({
      where: { id },
      select: { id: true, type: true, params: true, attempts: true },
    });
    if (!row) return null;
    const params = row.params;
    assertJobData(params);
    return { id: row.id, type: row.type, params, attempts: row.attempts };
  }

  /** RUNNING -> SUCCEEDED. Con resultado, vence a los EXPORT_TTL_DAYS (U6). */
  async succeed(id: string, result: JobResult | null, now: Date = new Date()): Promise<boolean> {
    const { count } = await this.prisma.backgroundJob.updateMany({
      where: { id, status: 'RUNNING' },
      data: {
        status: 'SUCCEEDED',
        finishedAt: now,
        errorCode: null,
        resultObjectKey: result?.objectKey ?? null,
        resultBytes: result ? BigInt(result.bytes) : null,
        expiresAt: result ? new Date(now.getTime() + this.env.EXPORT_TTL_DAYS * DAY_MS) : null,
      },
    });
    if (count === 0) this.logger.warn(`El trabajo ${id} no estaba RUNNING al terminar`);
    return count === 1;
  }

  /** QUEUED | RUNNING -> FAILED con un codigo estable (nunca el mensaje del error). */
  async fail(id: string, errorCode: string, now: Date = new Date()): Promise<boolean> {
    const { count } = await this.prisma.backgroundJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', finishedAt: now, errorCode: sanitizeErrorCode(errorCode) },
    });
    return count === 1;
  }

  /**
   * SUCCEEDED vencidos -> EXPIRED: borra el objeto y luego la clave (U6). Si S3 falla, la fila
   * sigue SUCCEEDED y la proxima corrida reintenta. Devuelve cuantos vencio en esta corrida.
   */
  async expireResults(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.backgroundJob.findMany({
      where: { status: 'SUCCEEDED', expiresAt: { lte: now } },
      select: { id: true, resultObjectKey: true },
      orderBy: { expiresAt: 'asc' },
      take: EXPIRE_BATCH,
    });
    let expired = 0;
    for (const row of rows) {
      try {
        if (row.resultObjectKey) await this.results.delete(row.resultObjectKey);
      } catch (error) {
        this.logger.warn(`No se borro el resultado del trabajo ${row.id}: ${describe(error)}`);
        continue;
      }
      const { count } = await this.prisma.backgroundJob.updateMany({
        where: { id: row.id, status: 'SUCCEEDED' },
        data: { status: 'EXPIRED', resultObjectKey: null, resultBytes: null },
      });
      expired += count;
    }
    return expired;
  }

  private async loadForActor(id: string, actor: JobActor): Promise<JobRow> {
    const row = await this.prisma.backgroundJob.findUnique({ where: { id }, select: rowSelect });
    if (!row) throw notFound();
    if (actor.role !== 'ADMIN' && row.requestedById !== actor.id) throw notFound();
    return row;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
