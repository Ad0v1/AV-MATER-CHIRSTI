import { describe, expect, it, vi } from 'vitest';
import { type Job, UnrecoverableError } from 'bullmq';
import type { BackgroundJobService } from './background-job.service.js';
import { JobError } from './jobs.types.js';
import { type TrackedJobData, TrackedJobRunner } from './tracked-job.runner.js';

const data: TrackedJobData = { backgroundJobId: 'b1' };
const job = (attemptsMade = 0, attempts: number | undefined = 3) =>
  ({
    name: 'x',
    data,
    attemptsMade,
    opts: { attempts },
    id: 'j',
  }) as unknown as Job<TrackedJobData>;

function setup() {
  const jobs = {
    start: vi.fn(() => Promise.resolve({ id: 'b1', type: 'X', params: {}, attempts: 1 })),
    succeed: vi.fn(() => Promise.resolve(true)),
    fail: vi.fn(() => Promise.resolve(true)),
  };
  return { jobs, runner: new TrackedJobRunner(jobs as unknown as BackgroundJobService) };
}

describe('TrackedJobRunner: reintentos y JobError (RNF-19)', () => {
  it('JobError reintentable: FAILED solo en el ultimo intento y conserva su codigo', async () => {
    const s = setup();
    const work = () => Promise.reject(new JobError('GOTENBERG_TIMEOUT'));
    await expect(s.runner.run(job(0), work)).rejects.toThrow('GOTENBERG_TIMEOUT');
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(s.runner.run(job(1), work)).rejects.toThrow('GOTENBERG_TIMEOUT');
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(s.runner.run(job(2), work)).rejects.toThrow('GOTENBERG_TIMEOUT');
    expect(s.jobs.fail).toHaveBeenCalledWith('b1', 'GOTENBERG_TIMEOUT');
  });

  it('JobError no reintentable falla al primer intento aunque queden reintentos', async () => {
    const s = setup();
    const work = () => Promise.reject(new JobError('YEAR_NOT_CLOSED', false));
    await expect(s.runner.run(job(0), work)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(s.jobs.fail).toHaveBeenCalledTimes(1);
    expect(s.jobs.succeed).not.toHaveBeenCalled();
  });

  it('un error comun no filtra su mensaje al codigo ni a la fila', async () => {
    const s = setup();
    const work = () => Promise.reject(new Error('nota 18 de Juana Perez'));
    await expect(s.runner.run(job(2), work)).rejects.toThrow(/^INTERNAL_ERROR$/);
    expect(JSON.stringify(s.jobs.fail.mock.calls)).not.toMatch(/Juana|nota/);
  });

  it('sin opts.attempts usa los intentos por defecto (3)', async () => {
    const s = setup();
    await expect(
      s.runner.run(job(1, undefined), () => Promise.reject(new Error('x'))),
    ).rejects.toThrow();
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(
      s.runner.run(job(2, undefined), () => Promise.reject(new Error('x'))),
    ).rejects.toThrow();
    expect(s.jobs.fail).toHaveBeenCalledTimes(1);
  });

  it('con attempts = 1 (un solo intento) el primer fallo ya es FAILED', async () => {
    const s = setup();
    await expect(s.runner.run(job(0, 1), () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(s.jobs.fail).toHaveBeenCalledTimes(1);
  });

  it('un fallo no marca SUCCEEDED y un exito no marca FAILED', async () => {
    const s = setup();
    await expect(s.runner.run(job(0), () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(s.jobs.succeed).not.toHaveBeenCalled();
    const ok = setup();
    await ok.runner.run(job(0), () => Promise.resolve(null));
    expect(ok.jobs.succeed).toHaveBeenCalledWith('b1', null);
    expect(ok.jobs.fail).not.toHaveBeenCalled();
  });

  it('JobError conserva codigo y retryable por defecto', () => {
    expect(new JobError('ABC')).toMatchObject({
      code: 'ABC',
      retryable: true,
      name: 'JobError',
      message: 'ABC',
    });
  });
});
