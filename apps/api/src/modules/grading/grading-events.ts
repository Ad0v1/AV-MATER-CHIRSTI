import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';

// Eventos en proceso de calificaciones (D-031, node:events). Se publican después del commit y de
// la bitácora. Solo ids, estado y origen: nunca la nota, el comentario ni el motivo de
// exoneración. Consumidor: Dev 5 (notificación RF-53; puede ignorar source AUTO).
export type GradingEventMap = {
  'grade.updated.v1': {
    gradeId: string;
    assignmentId: string;
    enrollmentId: string;
    courseSectionId: string;
    gradeStatus: 'GRADED' | 'NE' | 'EXEMPT';
    source: 'MANUAL' | 'AUTO';
    updatedAt: string;
  };
};

export type GradingEventType = keyof GradingEventMap;

export type GradingEvent = {
  [K in GradingEventType]: { type: K; payload: GradingEventMap[K] };
}[GradingEventType];

export type GradingEventHandler<K extends GradingEventType> = (event: {
  type: K;
  payload: GradingEventMap[K];
}) => void | Promise<void>;

/** Mismo patrón que ContentsEventPublisher: un handler que falla no afecta a los demás. */
@Injectable()
export class GradingEventPublisher {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger('GradingEvents');

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: GradingEvent): void {
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: GradingEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event.type, error));
        }
      } catch (error) {
        this.logFailure(event.type, error);
      }
    }
  }

  /** Suscribe un handler; devuelve la función para desuscribirlo. */
  on<K extends GradingEventType>(type: K, handler: GradingEventHandler<K>): () => void {
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }

  // Solo el nombre del error: el mensaje podría arrastrar datos.
  private logFailure(type: string, error: unknown): void {
    const name = error instanceof Error ? error.name : typeof error;
    this.logger.error(`Handler de ${type} falló: ${name}`);
  }
}
