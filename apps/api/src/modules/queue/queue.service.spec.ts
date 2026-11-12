import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { loadEnv } from '../../config/env.js';
import { producerConnection, workerConnection } from './queue.connection.js';
import { assertJobData } from './queue.data.js';
import { QueueService } from './queue.service.js';
import type { QueueName } from './queue.constants.js';

// Redis simulado: cada cola es un objeto con add/upsertJobScheduler/on/close.
function fakeQueues() {
  const created = new Map<QueueName, Record<string, ReturnType<typeof vi.fn>>>();
  const factory = (name: QueueName) => {
    const q = {
      add: vi.fn((jobName: string, _data: unknown, opts: { jobId?: string }) =>
        Promise.resolve({ id: opts.jobId ?? `auto-${jobName}` }),
      ),
      upsertJobScheduler: vi.fn(() => Promise.resolve({})),
      on: vi.fn(),
      close: vi.fn(() => Promise.resolve()),
    };
    created.set(name, q);
    return q as unknown as Queue;
  };
  return { created, service: new QueueService(factory) };
}

describe('QueueService', () => {
  it('encola con reintentos, espera exponencial y jobId idempotente', async () => {
    const { created, service } = fakeQueues();
    const id = await service.enqueue(
      'exports',
      'section-export',
      { backgroundJobId: 'abc' },
      {
        jobId: '0192f0c4-0000-7000-8000-000000000001',
      },
    );
    expect(id).toBe('0192f0c4-0000-7000-8000-000000000001');
    const add = created.get('exports')!.add;
    expect(add).toHaveBeenCalledWith(
      'section-export',
      { backgroundJobId: 'abc' },
      expect.objectContaining({
        jobId: '0192f0c4-0000-7000-8000-000000000001',
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      }),
    );
  });

  it('crea cada cola una sola vez y le pone un listener de errores', async () => {
    const { created, service } = fakeQueues();
    await service.enqueue('maintenance', 'ne-sweep', {});
    await service.enqueue('maintenance', 'ne-sweep', {});
    expect(created.size).toBe(1);
    expect(created.get('maintenance')!.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('rechaza una cola desconocida, un nombre o un jobId invalidos', async () => {
    const { service } = fakeQueues();
    await expect(service.enqueue('otra' as QueueName, 'x', {})).rejects.toThrow(/Cola/);
    await expect(service.enqueue('exports', 'Con Espacio', {})).rejects.toThrow(/Nombre/);
    await expect(service.enqueue('exports', 'x', {}, { jobId: 'a:b' })).rejects.toThrow(/Id/);
  });

  it('no deja pasar correos ni textos libres a Redis (RNF-09)', async () => {
    const { service } = fakeQueues();
    await expect(service.enqueue('notifications', 'x', { to: 'ana@colegio.pe' })).rejects.toThrow(
      /Valor invalido/,
    );
    await expect(service.enqueue('notifications', 'x', { body: 'a\nb' })).rejects.toThrow();
    await expect(service.enqueue('notifications', 'x', { body: 'x'.repeat(65) })).rejects.toThrow();
  });

  it('programa un barrido con id <cola>:<nombre> y un solo intento', async () => {
    const { created, service } = fakeQueues();
    await service.schedule('maintenance', 'ne-sweep', 60_000);
    expect(created.get('maintenance')!.upsertJobScheduler).toHaveBeenCalledWith(
      'maintenance:ne-sweep',
      { every: 60_000 },
      expect.objectContaining({ name: 'ne-sweep', opts: expect.objectContaining({ attempts: 1 }) }),
    );
    await expect(service.schedule('maintenance', 'x', 10)).rejects.toThrow(/Intervalo/);
  });

  it('cierra las colas al destruir el modulo', async () => {
    const { created, service } = fakeQueues();
    await service.enqueue('lifecycle', 'purge-year', {});
    await service.onModuleDestroy();
    expect(created.get('lifecycle')!.close).toHaveBeenCalled();
  });
});

describe('assertJobData', () => {
  it('acepta ids, numeros, banderas, null y listas de ids', () => {
    expect(() => assertJobData({ a: 'id', n: 1, b: true, z: null, ids: ['x', 'y'] })).not.toThrow();
  });

  it('rechaza objetos anidados, arreglos raiz, claves raras y numeros no finitos', () => {
    expect(() => assertJobData([])).toThrow();
    expect(() => assertJobData({ a: { b: 1 } })).toThrow();
    expect(() => assertJobData({ 'a-b': 1 })).toThrow(/Clave/);
    expect(() => assertJobData({ n: Number.NaN })).toThrow();
    expect(() => assertJobData({ ids: [1] })).toThrow();
  });
});

describe('conexiones y variables de entorno', () => {
  it('el worker usa maxRetriesPerRequest null; el productor falla rapido', () => {
    const env = { REDIS_URL: 'redis://127.0.0.1:6379' };
    expect(workerConnection(env)).toEqual({ url: env.REDIS_URL, maxRetriesPerRequest: null });
    expect(producerConnection(env)).toMatchObject({ enableOfflineQueue: false });
  });

  it('trae valores por defecto para SMTP, Gotenberg, TTL y concurrencia', () => {
    const env = loadEnv({});
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.EXPORT_TTL_DAYS).toBe(7);
    expect(env.WORKER_CONCURRENCY).toBe(2);
    expect(env.GOTENBERG_URL).toMatch(/^http/);
  });

  it('rechaza un SMTP_FROM con salto de linea y una concurrencia fuera de rango', () => {
    expect(() => loadEnv({ SMTP_FROM: 'a@b.pe\r\nBcc: x@y.pe' })).toThrow(/SMTP_FROM/);
    expect(() => loadEnv({ WORKER_CONCURRENCY: '0' })).toThrow(/WORKER_CONCURRENCY/);
    expect(() => loadEnv({ EXPORT_TTL_DAYS: '31' })).toThrow(/EXPORT_TTL_DAYS/);
  });
});
