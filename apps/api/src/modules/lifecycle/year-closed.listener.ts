import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AcademicEventPublisher } from '../academic/academic-events.js';
import { LifecycleService } from './lifecycle.service.js';

/**
 * RF-65 (U2): al cerrar un año (academic-year.closed.v1 de Dev 2, D-031) encola un YEAR_BACKUP
 * por sección. El evento vive en el proceso de la API y no tiene reintentos: si este handler
 * falla (p. ej. Redis caído), el barrido diario maintenance:lifecycle-sweep completa lo que falte.
 */
@Injectable()
export class YearClosedListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YearClosedListener.name);
  private off: (() => void) | null = null;

  constructor(
    private readonly events: AcademicEventPublisher,
    private readonly lifecycle: LifecycleService,
  ) {}

  onModuleInit(): void {
    this.off = this.events.on('academic-year.closed.v1', (event) =>
      this.handle(event.payload.academicYearId),
    );
  }

  onModuleDestroy(): void {
    this.off?.();
    this.off = null;
  }

  async handle(academicYearId: string): Promise<void> {
    try {
      const created = await this.lifecycle.ensureYearBackups(academicYearId);
      this.logger.log(`Año ${academicYearId} cerrado: ${created.length} respaldos encolados`);
    } catch (error) {
      // Solo el tipo de error: el barrido diario reintenta (RNF-09).
      this.logger.warn(
        `No se encolaron los respaldos del año ${academicYearId}: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
  }
}
