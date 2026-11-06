import { ServiceUnavailableException } from '@nestjs/common';
import { BackgroundJobService } from './background-job.service.js';
import { JobDownloadService } from './job-download.service.js';
import type { JobType, JobView } from './jobs.types.js';

const actor = { id: 'adm', role: 'ADMIN' as const, ip: '127.0.0.1' };
const view = (type: JobType, over: Partial<JobView> = {}): JobView => ({
  id: 'job-1',
  type,
  status: 'SUCCEEDED',
  errorCode: null,
  resultBytes: 10,
  hasResult: true,
  createdAt: '2026-11-06T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  ...over,
});

function setup(type: JobType, over: Partial<JobView> = {}, auditFails = false) {
  const order: string[] = [];
  const jobs = {
    findForActor: vi.fn(() => Promise.resolve(view(type, over))),
    createDownloadUrl: vi.fn(() => {
      order.push('sign');
      return Promise.resolve({ url: 'https://s3/x', method: 'GET', headers: {}, expiresAt: '' });
    }),
  };
  const audit = {
    record: vi.fn(() => {
      order.push('audit');
      return auditFails ? Promise.reject(new Error('db')) : Promise.resolve();
    }),
  };
  const prisma = { backgroundJob: { findUnique: vi.fn(() => Promise.resolve(null)) } };
  const service = new JobDownloadService(
    jobs as unknown as BackgroundJobService,
    prisma as never,
    audit as never,
  );
  return { service, jobs, audit, order };
}

describe('JobDownloadService (seguridad 5g, hallazgo 4)', () => {
  it.each(['PERSONAL_DATA_EXPORT', 'YEAR_BACKUP'] as const)(
    '%s: bitácora antes de firmar; si falla, 503 y sin URL',
    async (type) => {
      const ok = setup(type);
      await ok.service.downloadUrl('job-1', actor);
      expect(ok.order).toEqual(['audit', 'sign']);

      const ko = setup(type, {}, true);
      await expect(ko.service.downloadUrl('job-1', actor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(ko.jobs.createDownloadUrl).not.toHaveBeenCalled();
    },
  );

  it('sin resultado listo no registra descarga (la firma responde el 409)', async () => {
    const s = setup('PERSONAL_DATA_EXPORT', { status: 'RUNNING', hasResult: false });
    await s.service.downloadUrl('job-1', actor);
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('otros tipos: firma primero y una bitácora caída no corta la descarga', async () => {
    const s = setup('BULK_EXPORT', {}, true);
    await expect(s.service.downloadUrl('job-1', actor)).resolves.toMatchObject({
      url: 'https://s3/x',
    });
    expect(s.order).toEqual(['sign', 'audit']);
  });
});
