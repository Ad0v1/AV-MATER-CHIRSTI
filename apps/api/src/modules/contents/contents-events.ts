import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';

// Eventos en proceso del módulo de contenidos (D-031, node:events). Se publican después del
// commit y de la bitácora. Solo ids, fechas ISO UTC y configuración: nunca títulos,
// instrucciones, nombres de archivo ni datos personales. Consumidores: Dev 5 (notificaciones).
export type ContentsEventMap = {
  'assignment.created.v1': {
    assignmentId: string;
    courseSectionId: string;
    periodId: string;
    dueAt: string;
    allowLate: boolean;
    createdAt: string;
  };
  'assignment.updated.v1': {
    assignmentId: string;
    courseSectionId: string;
    periodId: string;
    dueAt: string;
    allowLate: boolean;
    /** Nombres de los campos cambiados (p. ej. ['dueAt', 'title']), sin sus valores de texto. */
    changedFields: string[];
    updatedAt: string;
  };
  // Fase 3d (entregas, RF-33/36/37): lo publica SubmissionsService después del commit.
  // Consumidores: Dev 4 (registro de notas) y Dev 5 (notificaciones). Sin nombres ni archivo.
  'submission.accepted.v1': {
    assignmentId: string;
    courseSectionId: string;
    enrollmentId: string;
    submissionId: string;
    versionId: string;
    versionNumber: number;
    receivedAt: string;
    isLate: boolean;
  };
  // Fase 3e (materiales, RF-26/27): lo publica el servicio de materiales.
  'material.published.v1': {
    materialId: string;
    courseSectionId: string;
    periodId: string | null;
    kind: 'CLASS' | 'READING';
    publishedAt: string;
  };
};

export type ContentsEventType = keyof ContentsEventMap;

export type ContentsEvent = {
  [K in ContentsEventType]: { type: K; payload: ContentsEventMap[K] };
}[ContentsEventType];

export type ContentsEventHandler<K extends ContentsEventType> = (event: {
  type: K;
  payload: ContentsEventMap[K];
}) => void | Promise<void>;

/**
 * Publica eventos de contenidos. Un handler que falla se registra en el log y no afecta la
 * respuesta ni a los demás handlers (mismo patrón que AcademicEventPublisher).
 */
@Injectable()
export class ContentsEventPublisher {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger('ContentsEvents');

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: ContentsEvent): void {
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: ContentsEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event.type, error));
        }
      } catch (error) {
        this.logFailure(event.type, error);
      }
    }
  }

  /** Suscribe un handler; devuelve la función para desuscribirlo. */
  on<K extends ContentsEventType>(type: K, handler: ContentsEventHandler<K>): () => void {
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }

  // Solo el nombre del error: el mensaje o la pila podrían arrastrar datos del payload.
  private logFailure(type: string, error: unknown): void {
    const name = error instanceof Error ? error.name : typeof error;
    this.logger.error(`Handler de ${type} falló: ${name}`);
  }
}
