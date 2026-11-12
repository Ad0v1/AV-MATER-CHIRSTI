import { EventEmitter } from 'node:events';
import { Injectable, Logger } from '@nestjs/common';
import type { AnnouncementScope, EducationLevel } from '../../generated/prisma/enums.js';

// Eventos en proceso de anuncios (D-031, node:events). Se publican después del commit y de la
// bitácora. Solo ids, alcance y fechas ISO UTC: nunca el título ni el cuerpo.
// Consumidor: notificaciones (RF-53), que encola el aviso en BullMQ (U2).
export type AnnouncementEventMap = {
  'announcement.published.v1': {
    announcementId: string;
    academicYearId: string;
    scope: AnnouncementScope;
    level: EducationLevel | null;
    gradeLevel: number | null;
    courseSectionId: string | null;
    publishedAt: string;
  };
};

export type AnnouncementEventType = keyof AnnouncementEventMap;

export type AnnouncementEvent = {
  [K in AnnouncementEventType]: { type: K; payload: AnnouncementEventMap[K] };
}[AnnouncementEventType];

export type AnnouncementEventHandler<K extends AnnouncementEventType> = (event: {
  type: K;
  payload: AnnouncementEventMap[K];
}) => void | Promise<void>;

/** Mismo patrón que ContentsEventPublisher: un handler que falla no afecta a los demás. */
@Injectable()
export class AnnouncementEventPublisher {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger('AnnouncementEvents');

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: AnnouncementEvent): void {
    for (const listener of this.emitter.listeners(event.type)) {
      try {
        const result = (listener as (e: AnnouncementEvent) => unknown)(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event.type, error));
        }
      } catch (error) {
        this.logFailure(event.type, error);
      }
    }
  }

  /** Suscribe un handler; devuelve la función para desuscribirlo. */
  on<K extends AnnouncementEventType>(type: K, handler: AnnouncementEventHandler<K>): () => void {
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
