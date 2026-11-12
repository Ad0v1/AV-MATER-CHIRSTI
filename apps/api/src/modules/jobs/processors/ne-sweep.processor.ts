import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { NeMaterializer } from '../../grading/ne-materializer.service.js';
import { JobProcessorRegistry, type JobProcessor } from '../processor.registry.js';

const BATCH = 200;

/**
 * maintenance:ne-sweep (RF-44, U2). Recorre las tareas vencidas de periodos y años abiertos y
 * materializa su NE con NeMaterializer de Dev 4, que es el unico dueño de la NE (docs/02): valida
 * que se pueda escribir, es idempotente y deja la bitacora y grade.updated.v1. Sin datos en el job.
 */
@Injectable()
export class NeSweepProcessor implements JobProcessor, OnModuleInit {
  readonly queue = 'maintenance' as const;
  readonly name = 'ne-sweep';
  readonly everyMs = 15 * 60 * 1000;
  private readonly logger = new Logger(NeSweepProcessor.name);

  constructor(
    private readonly registry: JobProcessorRegistry,
    private readonly prisma: PrismaService,
    private readonly ne: NeMaterializer,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(): Promise<{ assignments: number; grades: number }> {
    const now = new Date();
    let cursor: string | undefined;
    let assignments = 0;
    let grades = 0;
    for (;;) {
      const batch = await this.prisma.assignment.findMany({
        where: {
          deletedAt: null,
          dueAt: { lt: now },
          period: { closedAt: null, academicYear: { closedAt: null } },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const a of batch) {
        grades += await this.ne.materializeAssignment(a.id, now);
      }
      assignments += batch.length;
      if (batch.length < BATCH) break;
      cursor = batch[batch.length - 1].id;
    }
    this.logger.log(`Barrido de NE: ${assignments} tareas revisadas, ${grades} notas NE`);
    return { assignments, grades };
  }
}
