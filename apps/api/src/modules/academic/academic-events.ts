import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';

// Eventos en proceso del módulo académico (D-031 PROPUESTA). Fechas en ISO UTC.
export type AcademicEventMap = {
  'period.closed.v1': { periodId: string; academicYearId: string; closedAt: string };
  'period.reopened.v1': { periodId: string; academicYearId: string; reopenedAt: string };
  'academic-year.closed.v1': { academicYearId: string; year: number; closedAt: string };
};

export type AcademicEventType = keyof AcademicEventMap;

export type AcademicEvent = {
  [K in AcademicEventType]: { type: K; payload: AcademicEventMap[K] };
}[AcademicEventType];

export type AcademicEventHandler<K extends AcademicEventType> = (event: {
  type: K;
  payload: AcademicEventMap[K];
}) => void | Promise<void>;

/**
 * Publica eventos después del commit y de la bitácora. Un handler que falla
 * se registra en el log y no afecta la respuesta ni a los demás handlers.
 */
@Injectable()
export class AcademicEventPublisher {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger('AcademicEvents');

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: AcademicEvent): void {
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: AcademicEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event.type, error));
        }
      } catch (error) {
        this.logFailure(event.type, error);
      }
    }
  }

  /** Suscribe un handler; devuelve la función para desuscribirlo. */
  on<K extends AcademicEventType>(type: K, handler: AcademicEventHandler<K>): () => void {
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }

  private logFailure(type: string, error: unknown): void {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.logger.error(`Handler de ${type} falló: ${detail}`);
  }
}
