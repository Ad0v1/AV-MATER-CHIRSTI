import { describe, expect, it, vi } from 'vitest';
import { type Job, UnrecoverableError, type Worker } from 'bullmq';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Env } from '../../config/env.js';
import type { FileLifecycleService } from '../files/file-lifecycle.service.js';
import type { NeMaterializer } from '../grading/ne-materializer.service.js';
import type { QueueService } from '../queue/index.js';
import type { BackgroundJobService } from './background-job.service.js';
import type { MailerService } from './mailer.service.js';
import { JobProcessorRegistry, type JobProcessor } from './processor.registry.js';
import { IntentSweepProcessor } from './processors/intent-sweep.processor.js';
import { MailCheckProcessor } from './processors/mail-check.processor.js';
import { NeSweepProcessor } from './processors/ne-sweep.processor.js';
import { ResultExpiryProcessor } from './processors/result-expiry.processor.js';
import { JobError } from './jobs.types.js';
import { type TrackedJobData, TrackedJobRunner } from './tracked-job.runner.js';
import { WorkerHost } from './worker.host.js';

const job = <T>(name: string, data: T, attemptsMade = 0, attempts = 3) =>
  ({ name, data, attemptsMade, opts: { attempts }, id: 'j' }) as unknown as Job<T>;

function proc(over: Partial<JobProcessor> = {}): JobProcessor {
  return {
    queue: 'maintenance',
    name: 'demo',
    handle: vi.fn(() => Promise.resolve('ok')),
    ...over,
  };
}

describe('JobProcessorRegistry', () => {
  it('registra por <cola>:<nombre> y rechaza duplicados', () => {
    const r = new JobProcessorRegistry();
    const p = proc();
    r.register(p);
    expect(r.get('maintenance', 'demo')).toBe(p);
    expect(r.get('exports', 'demo')).toBeUndefined();
    expect(() => r.register(proc())).toThrow(/duplicado/);
    r.register(proc({ queue: 'exports', name: 'x', everyMs: 1000 }));
    expect(r.queues().sort()).toEqual(['exports', 'maintenance']);
    expect(r.scheduled().map((s) => s.name)).toEqual(['x']);
  });
});

describe('WorkerHost (Redis simulado)', () => {
  function setup() {
    const registry = new JobProcessorRegistry();
    const queues = { schedule: vi.fn(() => Promise.resolve()) };
    const workers: Array<{
      queue: string;
      on: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const factory = vi.fn((queue: string) => {
      const w = { queue, on: vi.fn(), close: vi.fn(() => Promise.resolve()) };
      workers.push(w);
      return w as unknown as Worker;
    });
    const host = new WorkerHost(registry, queues as unknown as QueueService, factory);
    return { registry, queues, workers, factory, host };
  }

  it('abre un worker por cola con procesadores y programa los barridos', async () => {
    const s = setup();
    s.registry.register(proc({ name: 'ne-sweep', everyMs: 900_000 }));
    s.registry.register(proc({ name: 'intent-sweep', everyMs: 600_000 }));
    s.registry.register(proc({ queue: 'notifications', name: 'mail-check' }));
    await s.host.onApplicationBootstrap();
    expect(s.workers.map((w) => w.queue).sort()).toEqual(['maintenance', 'notifications']);
    expect(s.queues.schedule).toHaveBeenCalledWith('maintenance', 'ne-sweep', 900_000);
    expect(s.queues.schedule).toHaveBeenCalledWith('maintenance', 'intent-sweep', 600_000);
    expect(s.queues.schedule).toHaveBeenCalledTimes(2);
    await s.host.stop();
    await s.host.stop();
    expect(s.workers.every((w) => w.close.mock.calls.length === 1)).toBe(true);
  });

  it('despacha por nombre; un nombre desconocido no se reintenta', async () => {
    const s = setup();
    const p = proc();
    s.registry.register(p);
    await expect(s.host.dispatch('maintenance', job('demo', {}))).resolves.toBe('ok');
    await expect(s.host.dispatch('maintenance', job('otro', {}))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});

describe('TrackedJobRunner', () => {
  function setup() {
    const jobs = {
      start: vi.fn(() =>
        Promise.resolve({ id: 'b1', type: 'BULK_EXPORT', params: {}, attempts: 1 } as unknown),
      ),
      succeed: vi.fn(() => Promise.resolve(true)),
      fail: vi.fn(() => Promise.resolve(true)),
    };
    return { jobs, runner: new TrackedJobRunner(jobs as unknown as BackgroundJobService) };
  }
  const data: TrackedJobData = { backgroundJobId: 'b1' };

  it('marca SUCCEEDED con el resultado', async () => {
    const s = setup();
    await s.runner.run(job('bulk-export', data), () =>
      Promise.resolve({ objectKey: 'k', bytes: 1 }),
    );
    expect(s.jobs.succeed).toHaveBeenCalledWith('b1', { objectKey: 'k', bytes: 1 });
  });

  it('si la fila ya termino no ejecuta nada (entrega al menos una vez)', async () => {
    const s = setup();
    s.jobs.start.mockResolvedValueOnce(null);
    const work = vi.fn();
    await s.runner.run(job('bulk-export', data), work);
    expect(work).not.toHaveBeenCalled();
  });

  it('reintenta sin marcar FAILED hasta el ultimo intento', async () => {
    const s = setup();
    const boom = () => Promise.reject(new Error('detalle con datos'));
    await expect(s.runner.run(job('x', data, 0, 3), boom)).rejects.toThrow('INTERNAL_ERROR');
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(s.runner.run(job('x', data, 2, 3), boom)).rejects.toThrow('INTERNAL_ERROR');
    expect(s.jobs.fail).toHaveBeenCalledWith('b1', 'INTERNAL_ERROR');
  });

  it('JobError no reintentable: FAILED con su codigo y UnrecoverableError', async () => {
    const s = setup();
    const work = () => Promise.reject(new JobError('YEAR_NOT_CLOSED', false));
    await expect(s.runner.run(job('x', data, 0, 3), work)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(s.jobs.fail).toHaveBeenCalledWith('b1', 'YEAR_NOT_CLOSED');
  });
});

describe('procesadores de maintenance y notifications', () => {
  it('ne-sweep: pagina las tareas vencidas abiertas y llama a materializeAssignment', async () => {
    const registry = new JobProcessorRegistry();
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: `a${String(i).padStart(3, '0')}` }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce([{ id: 'b' }]);
    const prisma = { assignment: { findMany } } as unknown as PrismaService;
    const materializeAssignment = vi.fn(() => Promise.resolve(2));
    const p = new NeSweepProcessor(registry, prisma, {
      materializeAssignment,
    } as unknown as NeMaterializer);
    p.onModuleInit();
    expect(registry.get('maintenance', 'ne-sweep')).toBe(p);
    await expect(p.handle()).resolves.toEqual({ assignments: 201, grades: 402 });
    const first = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(first.where).toMatchObject({
      deletedAt: null,
      period: { closedAt: null, academicYear: { closedAt: null } },
    });
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'a199' }, skip: 1 });
  });

  it('intent-sweep: delega en FileLifecycleService.expireIntents(now)', async () => {
    const registry = new JobProcessorRegistry();
    const expireIntents = vi.fn(() => Promise.resolve(3));
    const p = new IntentSweepProcessor(registry, {
      expireIntents,
    } as unknown as FileLifecycleService);
    p.onModuleInit();
    await expect(p.handle()).resolves.toEqual({ expired: 3 });
    expect(expireIntents).toHaveBeenCalledWith(expect.any(Date));
    expect(p.everyMs).toBeGreaterThan(0);
  });

  it('result-expiry-sweep: delega en BackgroundJobService.expireResults', async () => {
    const registry = new JobProcessorRegistry();
    const expireResults = vi.fn(() => Promise.resolve(0));
    const p = new ResultExpiryProcessor(registry, {
      expireResults,
    } as unknown as BackgroundJobService);
    await expect(p.handle()).resolves.toEqual({ expired: 0 });
  });

  it('mail-check: solo escribe a la direccion de SMTP_FROM', async () => {
    const registry = new JobProcessorRegistry();
    const sendNotice = vi.fn(() => Promise.resolve());
    const env = { SMTP_FROM: 'Aula <no@aula.local>' } as Env;
    const p = new MailCheckProcessor(registry, { sendNotice } as unknown as MailerService, env);
    await p.handle();
    expect(sendNotice).toHaveBeenCalledWith('no@aula.local', 'MAIL_CHECK');
  });
});
