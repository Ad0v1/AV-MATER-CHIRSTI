import { describe, expect, it, vi } from 'vitest';
import { JobError, type StartedJob } from '../jobs/index.js';
import { GotenbergClient, MAX_PDF_BYTES } from './gotenberg.client.js';
import { BulkExportProcessor, entryName } from './processors/bulk-export.processor.js';
import { zipPath } from '../jobs/index.js';
import { SectionExportProcessor } from './processors/section-export.processor.js';
import type { ReportRendererService } from './report-renderer.service.js';
import type { ReportsDataService } from './reports-data.service.js';
import type { SectionReportData } from './section-report.js';

// RF-58, RF-59: procesadores con dobles (sin BD, S3 ni Gotenberg) y el cliente de Gotenberg.

const started = (params: Record<string, unknown>): StartedJob =>
  ({ id: 'j1', type: 'SECTION_EXPORT', params, attempts: 1 }) as StartedJob;

const data = { course: 'Matemática', period: 'Bimestre 1' } as SectionReportData;

function renderer(file = Buffer.from('X')) {
  return {
    institution: vi.fn().mockResolvedValue({ name: 'IE', logo: null }),
    sectionData: vi.fn().mockResolvedValue(data),
    render: vi.fn().mockResolvedValue(file),
  };
}

describe('SectionExportProcessor', () => {
  it('genera y sube el archivo con la extensión del formato', async () => {
    const r = renderer();
    const results = { upload: vi.fn().mockResolvedValue(1) };
    const p = new SectionExportProcessor(
      null as never,
      null as never,
      r as unknown as ReportRendererService,
      results as never,
    );
    const out = await p.work(started({ courseSectionId: 'cs', periodId: 'p', format: 'PDF' }));
    expect(out.objectKey).toMatch(/^exports\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    expect(r.render).toHaveBeenCalledWith(data, 'PDF');
    expect(results.upload).toHaveBeenCalledWith(out.objectKey, Buffer.from('X'));
  });

  it('rechaza parámetros inválidos sin reintentar', async () => {
    const p = new SectionExportProcessor(
      null as never,
      null as never,
      renderer() as never,
      null as never,
    );
    await expect(
      p.work(started({ courseSectionId: 'cs', periodId: 'p', format: 'CSV' })),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS', retryable: false });
  });
});

describe('BulkExportProcessor', () => {
  const refs = [
    { id: 'c1', section: { gradeLevel: 3, code: 'A' } },
    { id: 'c2', section: { gradeLevel: 3, code: 'B' } },
  ];
  const results = () => ({
    upload: vi.fn(async (_k: string, body: NodeJS.ReadableStream) => {
      for await (const _chunk of body) void _chunk;
      return 10;
    }),
  });

  it('arma un ZIP con un archivo por curso-sección', async () => {
    const r = renderer();
    const d = { courseSections: vi.fn().mockResolvedValue(refs) };
    const p = new BulkExportProcessor(
      null as never,
      null as never,
      r as never,
      d as unknown as ReportsDataService,
      results() as never,
    );
    const out = await p.work(started({ academicYearId: 'y', periodId: 'p', format: 'XLSX' }));
    expect(out.objectKey).toMatch(/\.zip$/);
    expect(r.render).toHaveBeenCalledTimes(2);
  });

  it('falla con BULK_TOO_LARGE al pasar el tope de bytes', async () => {
    const p = new BulkExportProcessor(
      null as never,
      null as never,
      renderer(Buffer.alloc(600)) as never,
      { courseSections: vi.fn().mockResolvedValue(refs) } as never,
      results() as never,
    );
    await expect(
      p.work(started({ academicYearId: 'y', periodId: 'p', format: 'XLSX' }), new Date(), 1000),
    ).rejects.toMatchObject({ code: 'BULK_TOO_LARGE', retryable: false });
  });

  it('falla con BULK_TOO_LARGE si hay demasiados cursos-sección y con NO_COURSE_SECTIONS si no hay', async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ ...refs[0], id: `c${i}` }));
    const make = (list: unknown[]) =>
      new BulkExportProcessor(
        null as never,
        null as never,
        renderer() as never,
        { courseSections: vi.fn().mockResolvedValue(list) } as never,
        results() as never,
      );
    const s = started({ academicYearId: 'y', periodId: 'p', format: 'PDF' });
    await expect(make(many).work(s)).rejects.toMatchObject({ code: 'BULK_TOO_LARGE' });
    await expect(make([]).work(s)).rejects.toMatchObject({ code: 'NO_COURSE_SECTIONS' });
  });
});

describe('entryName (ZIP masivo)', () => {
  it('con un curso muy largo la extensión se conserva', () => {
    const name = entryName('Curso '.repeat(40) + ' - I Bimestre', 'xlsx');
    expect(name.endsWith('.xlsx')).toBe(true);
    expect(zipPath('1.º A', name).endsWith('.xlsx')).toBe(true);
    expect(entryName('...', 'pdf')).toMatch(/.pdf$/);
  });
});

describe('GotenbergClient', () => {
  const client = (fetcher: typeof fetch) =>
    new GotenbergClient({ GOTENBERG_URL: 'http://127.0.0.1:3001' }).useFetch(fetcher);

  it('envía el HTML como index.html a la ruta de Chromium y devuelve el PDF', async () => {
    const fetcher = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.href).toBe('http://127.0.0.1:3001/forms/chromium/convert/html');
      const form = init!.body as FormData;
      const file = form.get('files') as File;
      expect(file.name).toBe('index.html');
      expect(await file.text()).toBe('<p>x</p>');
      expect(init!.signal).toBeDefined();
      return new Response(Buffer.from('%PDF-1.7 ...'), { status: 200 });
    });
    const pdf = await client(fetcher as never).htmlToPdf('<p>x</p>');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('respuesta chunked sin content-length que pasa el tope: PDF_TOO_LARGE y corta la lectura', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++;
        if (sent > 100) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const big = client((async () => new Response(body, { status: 200 })) as never);
    await expect(big.htmlToPdf('x')).rejects.toMatchObject({ code: 'PDF_TOO_LARGE' });
    expect(sent).toBeLessThan(30);
  });

  it('error de red, HTTP o respuesta que no es PDF: JobError', async () => {
    const down = client((() => Promise.reject(new TypeError('fetch failed'))) as never);
    await expect(down.htmlToPdf('x')).rejects.toMatchObject({ code: 'PDF_UNAVAILABLE' });
    const http500 = client((async () => new Response('boom', { status: 500 })) as never);
    await expect(http500.htmlToPdf('x')).rejects.toMatchObject({ code: 'PDF_UNAVAILABLE' });
    const html = client((async () => new Response('<html>', { status: 200 })) as never);
    await expect(html.htmlToPdf('x')).rejects.toBeInstanceOf(JobError);
    const huge = client(
      (async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(MAX_PDF_BYTES + 1) },
        })) as never,
    );
    await expect(huge.htmlToPdf('x')).rejects.toMatchObject({ code: 'PDF_TOO_LARGE' });
  });
});
