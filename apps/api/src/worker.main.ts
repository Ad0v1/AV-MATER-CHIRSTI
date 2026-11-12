import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './modules/jobs/worker.module.js';
import { WorkerHost } from './modules/jobs/worker.host.js';

// Proceso worker (Dev 5, RNF-19, U1): contexto de Nest sin HTTP que consume las colas de
// BullMQ. Lo arranca apps/worker (pnpm --filter worker dev) o `node dist/worker.main.js`.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: false });
  const logger = new Logger('Worker');
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.log(`${signal}: terminando los trabajos en curso`);
    // Primero los workers (terminan lo que tienen) y despues Prisma, Redis y SMTP.
    await app.get(WorkerHost).stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  await app.init();
}

await bootstrap();
