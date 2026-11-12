import { Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/config.module.js';
import { defaultQueueFactory, QUEUE_FACTORY, QueueService } from './queue.service.js';

// Productor de colas de Dev 5 (RNF-19, U1). Lo importan la API (encolar) y el worker
// (programar barridos). Colas: notifications, exports, lifecycle y maintenance.
// Registrado en AppModule con autorizacion del usuario (30/10/2026).
@Module({
  providers: [
    { provide: QUEUE_FACTORY, inject: [ENV], useFactory: (env: Env) => defaultQueueFactory(env) },
    QueueService,
  ],
  exports: [QueueService],
})
export class QueueModule {}
