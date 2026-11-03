import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';
import type { FileRejectReason } from '../../generated/prisma/enums.js';

// Eventos en proceso del módulo de archivos (node:events, D-031). Solo ids y códigos: nunca el
// nombre original del archivo, nombres de personas ni la firma del antivirus. Fechas en ISO UTC.
export type FilesEventMap = {
  // docs/03: { uploadId, reason, studentId }. uploadId = id del StoredFile rechazado.
  'submission.rejected.v1': {
    uploadId: string;
    assignmentId: string;
    courseSectionId: string;
    studentId: string;
    reason: FileRejectReason;
    rejectedAt: string;
  };
};

export type FilesEventType = keyof FilesEventMap;

export type FilesEvent = {
  [K in FilesEventType]: { type: K; payload: FilesEventMap[K] };
}[FilesEventType];

export type FilesEventHandler<K extends FilesEventType> = (event: {
  type: K;
  payload: FilesEventMap[K];
}) => void | Promise<void>;

/**
 * Publica después del commit y de la bitácora. Un handler que falla se registra en el log y no
 * afecta la respuesta ni a los demás handlers (mismo contrato que AcademicEventPublisher).
 */
@Injectable()
export class FilesEventPublisher {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger('FilesEvents');

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: FilesEvent): void {
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: FilesEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event.type, error));
        }
      } catch (error) {
        this.logFailure(event.type, error);
      }
    }
  }

  /** Suscribe un handler; devuelve la función para desuscribirlo. */
  on<K extends FilesEventType>(type: K, handler: FilesEventHandler<K>): () => void {
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }

  private logFailure(type: string, error: unknown): void {
    const detail = error instanceof Error ? error.name : typeof error;
    this.logger.error(`Handler de ${type} falló: ${detail}`);
  }
}
