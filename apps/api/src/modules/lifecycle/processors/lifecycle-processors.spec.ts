import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { JobProcessorRegistry, JobResultStorage, StartedJob } from '../../jobs/index.js';
import { readZip } from '../../jobs/zip-reader.mock-spec.js';
import type { StorageService } from '../../storage/index.js';
import type { LifecycleService } from '../lifecycle.service.js';
import { LifecycleSweepProcessor } from './lifecycle-sweep.processor.js';
import { BACKUP_INDEX_FILE, YearBackupProcessor } from './year-backup.processor.js';

// RF-65 (respaldo anual), RF-66 (barrido diario): lógica de los procesadores sin BD ni S3.

const YEAR = '0192f0c4-0000-7000-8000-0000000000a1';
const SECTION = '0192f0c4-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-12-20T10:00:00Z');

const started = (params: StartedJob['params']): StartedJob => ({
  id: 'job-1',
  type: 'YEAR_BACKUP',
  params,
  attempts: 1,
});

describe('RF-66: LifecycleSweepProcessor', () => {
  const make = (result: { backups: number; purges: number }) => {
    const lifecycle = { sweep: vi.fn(() => Promise.resolve(result)) };
    const registry = { register: vi.fn() };
    const processor = new LifecycleSweepProcessor(
      registry as unknown as JobProcessorRegistry,
      lifecycle as unknown as LifecycleService,
    );
    return { lifecycle, registry, processor };
  };

  it('se registra en maintenance una vez al día', () => {
    const { processor, registry } = make({ backups: 0, purges: 0 });
    processor.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(processor);
    expect(processor.queue).toBe('maintenance');
    expect(processor.name).toBe('lifecycle-sweep');
    expect(processor.everyMs).toBe(86_400_000);
  });

  it('devuelve lo que encoló el barrido, con o sin trabajo', async () => {
    const busy = make({ backups: 2, purges: 1 });
    expect(await busy.processor.handle()).toEqual({ backups: 2, purges: 1 });
    expect(busy.lifecycle.sweep).toHaveBeenCalledWith(expect.any(Date));
    const idle = make({ backups: 0, purges: 0 });
    expect(await idle.processor.handle()).toEqual({ backups: 0, purges: 0 });
  });

  it('un fallo del barrido sube al worker para que lo registre y reintente', async () => {
    const { processor, lifecycle } = make({ backups: 0, purges: 0 });
    lifecycle.sweep.mockRejectedValueOnce(new Error('db caída'));
    await expect(processor.handle()).rejects.toThrow('db caída');
  });
});

describe('RF-65: YearBackupProcessor.work', () => {
  const file = (over: Record<string, unknown> = {}) => ({
    objectKey: 'materials/2026/12/a.pdf',
    sizeBytes: 12,
    sha256: 'ab'.repeat(32),
    scanStatus: 'CLEAN',
    uploadStatus: 'COMPLETED',
    purgedAt: null,
    ...over,
  });

  function setup(opts: {
    section?: unknown;
    materials?: unknown[];
    assignments?: unknown[];
    versions?: unknown[];
    openStream?: (key: string) => Promise<Readable>;
  }) {
    const uploads = new Map<string, Buffer>();
    const results = {
      upload: vi.fn(async (key: string, body: Buffer | Readable) => {
        const chunks: Buffer[] = [];
        for await (const c of body as Readable) chunks.push(c as Buffer);
        const all = Buffer.concat(chunks);
        uploads.set(key, all);
        return all.length;
      }),
    };
    const prisma = {
      section: {
        findFirst: vi.fn(() =>
          Promise.resolve(
            opts.section === undefined
              ? { gradeLevel: 3, code: 'A', academicYear: { year: 2026, closedAt: NOW } }
              : opts.section,
          ),
        ),
      },
      courseSection: {
        findMany: vi.fn(() => Promise.resolve([{ id: 'cs1', course: { name: 'Matemática' } }])),
      },
      material: { findMany: vi.fn(() => Promise.resolve(opts.materials ?? [])) },
      assignment: { findMany: vi.fn(() => Promise.resolve(opts.assignments ?? [])) },
      submissionVersion: { findMany: vi.fn(() => Promise.resolve(opts.versions ?? [])) },
    };
    const storage = {
      openObjectStream: vi.fn(
        opts.openStream ?? (() => Promise.resolve(Readable.from([Buffer.from('%PDF-1.4 x')]))),
      ),
    };
    const processor = new YearBackupProcessor(
      { register: vi.fn() } as unknown as JobProcessorRegistry,
      {} as never,
      prisma as unknown as PrismaService,
      results as unknown as JobResultStorage,
      storage as unknown as StorageService,
    );
    return { processor, prisma, storage, uploads, results };
  }

  it('parámetros incompletos: INVALID_PARAMS sin reintentos', async () => {
    const { processor } = setup({});
    const incomplete: StartedJob['params'][] = [
      {},
      { academicYearId: YEAR },
      { sectionId: SECTION },
    ];
    for (const params of incomplete) {
      await expect(processor.work(started(params), NOW)).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
        retryable: false,
      });
    }
  });

  it('sección que no es del año: SECTION_NOT_FOUND; año abierto: YEAR_NOT_CLOSED', async () => {
    await expect(
      setup({ section: null }).processor.work(
        started({ academicYearId: YEAR, sectionId: SECTION }),
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'SECTION_NOT_FOUND', retryable: false });
    await expect(
      setup({
        section: { gradeLevel: 3, code: 'A', academicYear: { year: 2026, closedAt: null } },
      }).processor.work(started({ academicYearId: YEAR, sectionId: SECTION }), NOW),
    ).rejects.toMatchObject({ code: 'YEAR_NOT_CLOSED', retryable: false });
  });

  it('sube a backups/ un ZIP que no vence, con las rutas y el índice', async () => {
    const s = setup({
      materials: [
        {
          id: 'aaaaaaaa-1111',
          kind: 'CLASS',
          title: 'Álgebra',
          period: { label: 'I' },
          file: file(),
        },
        { id: 'bbbbbbbb-2222', kind: 'READING', title: 'Lectura', period: null, file: file() },
      ],
      assignments: [
        {
          id: 'cccccccc-3333',
          title: 'Tarea 1',
          period: { label: 'I' },
          attachmentFile: file(),
        },
      ],
      versions: [
        {
          versionNumber: 2,
          receivedAt: NOW,
          isLate: true,
          file: file(),
          submission: {
            assignment: { id: 'cccccccc-3333', title: 'Tarea 1', period: { label: 'I' } },
            enrollment: { student: { fullName: 'Ana Pérez' } },
          },
        },
      ],
    });
    const result = await s.processor.work(
      started({ academicYearId: YEAR, sectionId: SECTION }),
      NOW,
    );
    expect(result.keepUntilPurge).toBe(true);
    expect(result.objectKey).toMatch(/^backups\//);
    const zip = readZip(s.uploads.get(result.objectKey)!);
    const names = [...zip.keys()];
    expect(names).toContain(`2026 3A/${BACKUP_INDEX_FILE}`);
    expect(names.filter((n) => n.endsWith('.pdf'))).toHaveLength(4);
    expect(names.some((n) => n.includes('Entregas/Ana Pérez - v2.pdf'))).toBe(true);
    const csv = zip.get(`2026 3A/${BACKUP_INDEX_FILE}`)!.toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM para Excel
    expect(csv).toContain('ENTREGA');
    expect(csv).toContain(',SI,'); // entrega tardía
    expect(csv).toContain('INCLUIDO');
    expect(csv).not.toContain('FALTANTE');
  });

  it('solo respalda PDF limpios, confirmados y sin purgar', async () => {
    const s = setup({
      materials: [
        { id: 'a1', kind: 'CLASS', title: 'Limpio', period: null, file: file() },
        {
          id: 'a2',
          kind: 'CLASS',
          title: 'Infectado',
          period: null,
          file: file({ scanStatus: 'INFECTED' }),
        },
        {
          id: 'a3',
          kind: 'CLASS',
          title: 'Pendiente',
          period: null,
          file: file({ scanStatus: 'PENDING' }),
        },
        {
          id: 'a4',
          kind: 'CLASS',
          title: 'Sin confirmar',
          period: null,
          file: file({ uploadStatus: 'PENDING' }),
        },
        { id: 'a5', kind: 'CLASS', title: 'Purgado', period: null, file: file({ purgedAt: NOW }) },
      ],
      assignments: [
        { id: 'b1', title: 'Sin adjunto', period: { label: 'I' }, attachmentFile: null },
      ],
    });
    const result = await s.processor.work(
      started({ academicYearId: YEAR, sectionId: SECTION }),
      NOW,
    );
    const zip = readZip(s.uploads.get(result.objectKey)!);
    const pdfs = [...zip.keys()].filter((n) => n.endsWith('.pdf'));
    expect(pdfs).toHaveLength(1);
    expect(pdfs[0]).toContain('Limpio');
    expect(s.storage.openObjectStream).toHaveBeenCalledTimes(1);
  });

  it('un objeto ausente en S3 queda como FALTANTE y no corta el respaldo', async () => {
    const s = setup({
      materials: [{ id: 'a1', kind: 'CLASS', title: 'Perdido', period: null, file: file() }],
      openStream: () => Promise.reject(new NotFoundException()),
    });
    const result = await s.processor.work(
      started({ academicYearId: YEAR, sectionId: SECTION }),
      NOW,
    );
    const zip = readZip(s.uploads.get(result.objectKey)!);
    expect([...zip.keys()]).toEqual([`2026 3A/${BACKUP_INDEX_FILE}`]);
    expect(zip.get(`2026 3A/${BACKUP_INDEX_FILE}`)!.toString('utf8')).toContain('FALTANTE');
  });

  it('otro error de S3 sí corta el trabajo (se reintenta)', async () => {
    const s = setup({
      materials: [{ id: 'a1', kind: 'CLASS', title: 'x', period: null, file: file() }],
      openStream: () => Promise.reject(new Error('S3 caído')),
    });
    await expect(
      s.processor.work(started({ academicYearId: YEAR, sectionId: SECTION }), NOW),
    ).rejects.toThrow('S3 caído');
  });

  it('un título con fórmula no llega al índice como fórmula (CSV seguro)', async () => {
    const s = setup({
      materials: [
        { id: 'a1', kind: 'CLASS', title: '=HYPERLINK("http://x")', period: null, file: file() },
      ],
    });
    const result = await s.processor.work(
      started({ academicYearId: YEAR, sectionId: SECTION }),
      NOW,
    );
    const csv = readZip(s.uploads.get(result.objectKey)!)
      .get(`2026 3A/${BACKUP_INDEX_FILE}`)!
      .toString('utf8');
    for (const line of csv.split('\r\n').slice(1)) {
      expect(line).not.toMatch(/(^|,)"?=HYPERLINK/);
    }
  });

  it('una sección sin archivos genera un ZIP con solo el índice', async () => {
    const s = setup({});
    const result = await s.processor.work(
      started({ academicYearId: YEAR, sectionId: SECTION }),
      NOW,
    );
    const zip = readZip(s.uploads.get(result.objectKey)!);
    expect([...zip.keys()]).toEqual([`2026 3A/${BACKUP_INDEX_FILE}`]);
    expect(result.bytes).toBeGreaterThan(0);
  });
});
