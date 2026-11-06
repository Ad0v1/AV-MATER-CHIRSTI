import { DEFAULT_LITERAL_SCALE } from '@aula/shared';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { JobError, TrackedJobRunner, type TrackedJobData } from '../jobs/index.js';
import { readZip } from '../jobs/zip-reader.mock-spec.js';
import { aggregateDashboard, type DashboardInput } from './dashboard-aggregate.js';
import { GotenbergClient, MAX_PDF_BYTES } from './gotenberg.client.js';
import { BulkExportProcessor, MAX_BULK_BYTES } from './processors/bulk-export.processor.js';
import { SectionExportProcessor } from './processors/section-export.processor.js';
import { buildSectionHtml } from './report-html.js';
import { ReportRendererService } from './report-renderer.service.js';
import { buildSectionXlsx, XLSX_SHEET, XLSX_TABLE_ROW } from './report-xlsx.js';
import { MAX_REPORT_COURSE_SECTIONS, ReportsDataService } from './reports-data.service.js';
import { ReportsService } from './reports.service.js';
import { toSectionReportData, type SectionReportData } from './section-report.js';

// QA de la fase 5f (RF-57..60): logo, datos vacíos, Gotenberg caído, ZIP masivo, escapes, celdas
// del XLSX, dashboard y errores de datos. Sin BD, S3 ni Gotenberg (dobles).

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

function data(over: Partial<SectionReportData> = {}): SectionReportData {
  return {
    institution: { name: 'IE', logo: null },
    year: 2026,
    course: 'Matemática',
    teacher: 'Docente',
    gradeLevel: 3,
    sectionCode: 'A',
    period: 'Bimestre 1',
    generatedAt: new Date('2026-05-10T15:00:00Z'),
    riskLiteral: 'C',
    assignments: [{ title: 'T1' }],
    students: [
      {
        fullName: 'Ana',
        isCurrent: true,
        cells: [{ state: 'GRADED', value: '15.50', isLate: false }],
        average: { status: 'OK', rounded: 16, literal: 'A', counted: 1, exempt: 0 },
        atRisk: false,
      },
    ],
    ...over,
  };
}

async function loadXlsx(d: SectionReportData) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildSectionXlsx(d)) as unknown as ExcelJS.Buffer);
  return wb;
}

function book(over: { students?: unknown[]; assignments?: unknown[]; teacher?: unknown } = {}) {
  return {
    year: 2026,
    teacher: over.teacher === undefined ? { id: 't', fullName: 'Profe' } : over.teacher,
    view: {
      courseSection: { course: { name: 'Matemática' }, section: { gradeLevel: 3, code: 'A' } },
      period: { label: 'Bimestre 1' },
      dashboard: {
        riskLiteral: 'C',
        distribution: { AD: 0, A: 1, B: 0, C: 0 },
        noGrades: 0,
        atRisk: [],
        counts: { onTime: 1, late: 0, ne: 0 },
      },
      assignments: over.assignments ?? [{ title: 'T1' }],
      students: over.students ?? [
        {
          studentId: 's1',
          fullName: 'Ana',
          isCurrent: true,
          average: { status: 'OK', rounded: 16, literal: 'A', counted: 1, exempt: 0 },
          atRisk: false,
          cells: [{ state: 'GRADED', value: '15.50', isLate: false }],
        },
      ],
    },
  };
}

/** Renderizador real con dobles de BD, almacenamiento y Gotenberg. */
function renderer(opts: {
  settings?: unknown;
  download?: () => Promise<Buffer>;
  gradebook?: () => Promise<unknown>;
  fetcher?: typeof fetch;
}) {
  const prisma = {
    institutionSettings: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.settings === undefined
            ? { name: 'I.E. Mater', logoObjectKey: 'logo/x', logoMime: 'image/png' }
            : opts.settings,
        ),
    },
  };
  const logos = { download: vi.fn(opts.download ?? (() => Promise.resolve(PNG))) };
  const dataSvc = { sectionGradebook: vi.fn(opts.gradebook ?? (() => Promise.resolve(book()))) };
  const pdf = new GotenbergClient({ GOTENBERG_URL: 'http://127.0.0.1:3001' }).useFetch(
    opts.fetcher ??
      ((async () => new Response(Buffer.from('%PDF-1.7 ok'), { status: 200 })) as typeof fetch),
  );
  const svc = new ReportRendererService(prisma as never, dataSvc as never, logos as never, pdf);
  return { svc, prisma, logos, dataSvc };
}

const NO_LOGO = { name: 'IE', logo: null };

describe('logo en el XLSX y el PDF', () => {
  it('RF-58: PNG real se embebe en el XLSX (extensión png) y en el HTML como data:image/png', async () => {
    const d = data({ institution: { name: 'IE', logo: { mime: 'image/png', data: PNG } } });
    const wb = await loadXlsx(d);
    expect(wb.model.media).toHaveLength(1);
    expect(wb.model.media![0]).toMatchObject({ type: 'image', extension: 'png' });
    expect(buildSectionHtml(d)).toContain(`src="data:image/png;base64,${PNG.toString('base64')}"`);
  });

  it('RF-58: JPEG real se embebe en el XLSX (extensión jpeg) y en el HTML como data:image/jpeg', async () => {
    const d = data({ institution: { name: 'IE', logo: { mime: 'image/jpeg', data: JPEG } } });
    const wb = await loadXlsx(d);
    expect(wb.model.media).toHaveLength(1);
    expect(wb.model.media![0].extension).toBe('jpeg');
    expect(buildSectionHtml(d)).toContain(
      `src="data:image/jpeg;base64,${JPEG.toString('base64')}"`,
    );
  });

  it('RF-58: sin logo no hay imagen ni <img>', async () => {
    expect((await loadXlsx(data())).model.media ?? []).toHaveLength(0);
    expect(buildSectionHtml(data())).not.toContain('<img');
  });

  it('RF-58: ReportRendererService descarga el logo con clave y MIME válidos', async () => {
    const inst = await renderer({}).svc.institution();
    expect(inst).toEqual({ name: 'I.E. Mater', logo: { mime: 'image/png', data: PNG } });
  });

  it('RF-58: si el logo falla (S3 caído) el reporte XLSX y PDF sale sin él', async () => {
    const r = renderer({ download: () => Promise.reject(new Error('S3 caído')) });
    const inst = await r.svc.institution();
    expect(inst).toEqual({ name: 'I.E. Mater', logo: null });
    const d = await r.svc.sectionData('cs', 'p', inst, new Date());
    expect((await loadXlsx(d)).model.media ?? []).toHaveLength(0);
    expect(buildSectionHtml(d)).not.toContain('<img');
    await expect(r.svc.render(d, 'XLSX')).resolves.toBeInstanceOf(Buffer);
    expect((await r.svc.render(d, 'PDF')).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('RF-58: sin fila de ajustes, sin clave o con MIME fuera de lista: sin logo y sin descargar', async () => {
    const cases = [
      { settings: null, name: 'Institución educativa' },
      { settings: { name: 'IE', logoObjectKey: null, logoMime: null }, name: 'IE' },
      { settings: { name: 'IE', logoObjectKey: 'k', logoMime: 'image/svg+xml' }, name: 'IE' },
      { settings: { name: 'IE', logoObjectKey: 'k', logoMime: 'image/gif' }, name: 'IE' },
      { settings: { name: 'IE', logoObjectKey: 'k', logoMime: null }, name: 'IE' },
    ];
    for (const c of cases) {
      const r = renderer({ settings: c.settings });
      expect(await r.svc.institution()).toEqual({ name: c.name, logo: null });
      expect(r.logos.download).not.toHaveBeenCalled();
    }
  });
});

describe('datos vacíos', () => {
  it('RF-58: sección sin estudiantes, XLSX y HTML válidos', async () => {
    const r = renderer({ gradebook: () => Promise.resolve(book({ students: [] })) });
    const d = await r.svc.sectionData('cs', 'p', NO_LOGO, new Date());
    const ws = (await loadXlsx(d)).getWorksheet(XLSX_SHEET)!;
    expect(ws.getRow(XLSX_TABLE_ROW + 1).getCell(2).value).toBeNull();
    expect(buildSectionHtml(d)).toContain('<td colspan="6">Sin estudiantes.</td>');
  });

  it('RF-57: curso sin docente dice "Sin docente asignado" en XLSX y HTML', async () => {
    const r = renderer({ gradebook: () => Promise.resolve(book({ teacher: null })) });
    const d = await r.svc.sectionData('cs', 'p', NO_LOGO, new Date());
    expect(d.teacher).toBeNull();
    expect((await loadXlsx(d)).getWorksheet(XLSX_SHEET)!.getCell('B3').value).toBe(
      'Docente: Sin docente asignado',
    );
    expect(buildSectionHtml(d)).toContain('<dd>Sin docente asignado</dd>');
  });

  it('RF-58: período sin tareas deja solo las columnas fijas y "Sin notas"', async () => {
    const noTasks = book({
      assignments: [],
      students: [
        {
          studentId: 's1',
          fullName: 'Ana',
          isCurrent: true,
          average: { status: 'NO_GRADES', counted: 0, exempt: 0 },
          atRisk: false,
          cells: [],
        },
      ],
    });
    const r = renderer({ gradebook: () => Promise.resolve(noTasks) });
    const d = await r.svc.sectionData('cs', 'p', NO_LOGO, new Date());
    expect(d.assignments).toEqual([]);
    const ws = (await loadXlsx(d)).getWorksheet(XLSX_SHEET)!;
    const head = ws.getRow(XLSX_TABLE_ROW);
    expect([1, 2, 3, 4, 5].map((i) => head.getCell(i).value)).toEqual([
      'N.º',
      'Estudiante',
      'Promedio',
      'Literal',
      'En riesgo',
    ]);
    const row = ws.getRow(XLSX_TABLE_ROW + 1);
    expect(row.getCell(3).value).toBeNull();
    expect(row.getCell(4).value).toBe('Sin notas');
    expect(row.getCell(5).value).toBe('No');
    expect(buildSectionHtml(d)).toContain('Sin notas');
  });

  it('RF-58: 404 y 422 del motor son REPORT_SOURCE_NOT_FOUND no reintentable; otro error se relanza', async () => {
    for (const status of [404, 422]) {
      const r = renderer({
        gradebook: () => Promise.reject(Object.assign(new Error('x'), { status })),
      });
      await expect(r.svc.sectionData('cs', 'p', NO_LOGO, new Date())).rejects.toMatchObject({
        code: 'REPORT_SOURCE_NOT_FOUND',
        retryable: false,
      });
    }
    const boom = new Error('BD caída');
    const r = renderer({ gradebook: () => Promise.reject(boom) });
    await expect(r.svc.sectionData('cs', 'p', NO_LOGO, new Date())).rejects.toBe(boom);
  });
});

describe('escapes en XLSX y HTML', () => {
  const triggers = ['=SUM(1)', '+1', '-1', '@cmd', '\t=x', '\r=x'];

  it.each(triggers)('RF-58: XLSX, texto que empieza con %j no queda como fórmula', async (txt) => {
    const d = data({
      institution: { name: txt, logo: null },
      course: txt,
      teacher: txt,
      period: txt,
      assignments: [{ title: txt }],
      students: [
        {
          fullName: txt,
          isCurrent: true,
          cells: [{ state: 'NE', value: '0.00', isLate: false }],
          average: { status: 'NO_GRADES', counted: 0, exempt: 0 },
          atRisk: false,
        },
      ],
    });
    const ws = (await loadXlsx(d)).getWorksheet(XLSX_SHEET)!;
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        expect(cell.type).not.toBe(ExcelJS.ValueType.Formula);
        if (typeof cell.value === 'string') expect(cell.value).not.toMatch(/^[=+\-@\t\r]/);
      }),
    );
    // El XML normaliza CR a LF al releer el archivo.
    const expected = `'${txt}`.replace('\r', '\n');
    expect(ws.getRow(XLSX_TABLE_ROW).getCell(3).value).toBe(expected);
    expect(ws.getRow(XLSX_TABLE_ROW + 1).getCell(2).value).toBe(expected);
    expect(ws.getCell('B1').value).toBe(expected);
  });

  it('RF-58: HTML, títulos y nombres con <script>, comillas y </title> quedan como texto', () => {
    const evil = '</title><script>alert(1)</script><img src=x onerror=alert(2)>"\'';
    const html = buildSectionHtml(
      data({
        institution: { name: evil, logo: null },
        course: evil,
        teacher: evil,
        period: evil,
        assignments: [{ title: evil }],
        students: [
          {
            fullName: evil,
            isCurrent: false,
            cells: [{ state: 'GRADED', value: '10.00', isLate: false }],
            average: { status: 'NO_GRADES', counted: 0, exempt: 0 },
            atRisk: true,
          },
        ],
      }),
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]+onerror/i);
    expect(html.match(/<\/title>/g)).toHaveLength(1);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&#39;');
  });

  it('RF-58: HTML, comillas y etiquetas en el curso no rompen el documento', () => {
    const html = buildSectionHtml(data({ course: '"><svg onload=1>' }));
    expect(html).not.toContain('<svg');
    expect(html).toContain('&quot;&gt;&lt;svg onload=1&gt;');
  });
});

describe('XLSX: NE, EXO y vacías; nunca comentario ni motivo', () => {
  it('RF-58: "NE x.xx", EXO y celda vacía', async () => {
    const d = data({
      assignments: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }],
      students: [
        {
          fullName: 'Ana',
          isCurrent: true,
          cells: [
            { state: 'NE', value: '5.00', isLate: false },
            { state: 'EXEMPT', value: null, isLate: false },
            { state: null, value: null, isLate: false },
            { state: 'GRADED', value: '0.00', isLate: true },
          ],
          average: { status: 'OK', rounded: 3, literal: 'C', counted: 2, exempt: 1 },
          atRisk: true,
        },
      ],
    });
    const ws = (await loadXlsx(d)).getWorksheet(XLSX_SHEET)!;
    const row = ws.getRow(XLSX_TABLE_ROW + 1);
    expect(row.getCell(3).value).toBe('NE 5.00');
    expect(row.getCell(4).value).toBe('EXO');
    expect([null, ''].includes(row.getCell(5).value as null)).toBe(true);
    expect(row.getCell(6).value).toBe(0);
    expect(row.getCell(7).value).toBe(3);
  });

  it('D-049: toSectionReportData y los archivos no llevan comentario ni exemptionReason', async () => {
    const view = {
      courseSection: { course: { name: 'Mat' }, section: { gradeLevel: 1, code: 'A' } },
      period: { label: 'P1' },
      dashboard: { riskLiteral: 'C' },
      assignments: [{ title: 'T' }],
      students: [
        {
          studentId: 's1',
          fullName: 'Ana',
          isCurrent: true,
          atRisk: false,
          average: { status: 'NO_GRADES', counted: 0, exempt: 1 },
          cells: [
            {
              state: 'EXEMPT',
              value: null,
              isLate: false,
              comment: 'COMENTARIO-SECRETO',
              exemptionReason: 'MOTIVO-SECRETO',
            },
          ],
        },
      ],
    };
    const d = toSectionReportData(view as never, {
      institution: NO_LOGO,
      year: 2026,
      teacher: null,
      now: new Date(),
    });
    expect(JSON.stringify(d)).not.toMatch(/SECRETO|comment|exemptionReason/);
    const wb = await loadXlsx(d);
    expect(JSON.stringify(wb.model)).not.toMatch(/SECRETO/);
    wb.getWorksheet(XLSX_SHEET)!.eachRow((row) =>
      row.eachCell((cell) => expect(cell.note).toBeUndefined()),
    );
    expect(buildSectionHtml(d)).not.toMatch(/SECRETO/);
  });
});

describe('Gotenberg caído: reintentos y códigos (RNF-19)', () => {
  const job = (attemptsMade: number, attempts = 3) =>
    ({
      data: { backgroundJobId: 'b1' },
      opts: { attempts },
      attemptsMade,
    }) as unknown as Job<TrackedJobData>;

  function setup(fetcher: typeof fetch) {
    const jobs = {
      start: vi.fn().mockResolvedValue({
        id: 'b1',
        type: 'SECTION_EXPORT',
        params: { courseSectionId: 'cs', periodId: 'p', format: 'PDF' },
        attempts: 1,
      }),
      succeed: vi.fn().mockResolvedValue(true),
      fail: vi.fn().mockResolvedValue(true),
    };
    const results = { upload: vi.fn().mockResolvedValue(10) };
    const r = renderer({ fetcher });
    const p = new SectionExportProcessor(
      null as never,
      new TrackedJobRunner(jobs as never),
      r.svc,
      results as never,
    );
    return { jobs, results, p };
  }

  it('RF-58: PDF_UNAVAILABLE se reintenta y termina FAILED en el último intento', async () => {
    const s = setup((() => Promise.reject(new TypeError('fetch failed'))) as never);
    await expect(s.p.handle(job(0))).rejects.toThrow('PDF_UNAVAILABLE');
    await expect(s.p.handle(job(1))).rejects.toThrow('PDF_UNAVAILABLE');
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(s.p.handle(job(2))).rejects.toThrow('PDF_UNAVAILABLE');
    expect(s.jobs.fail).toHaveBeenCalledTimes(1);
    expect(s.jobs.fail).toHaveBeenCalledWith('b1', 'PDF_UNAVAILABLE');
    expect(s.jobs.succeed).not.toHaveBeenCalled();
    expect(s.results.upload).not.toHaveBeenCalled();
  });

  it('RF-58: HTTP 500, 503 y timeout también son PDF_UNAVAILABLE sin cuerpo en el error', async () => {
    const fetchers = [
      async () => new Response('SECRETO interno', { status: 500 }),
      async () => new Response('x', { status: 503 }),
      () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
    ];
    for (const f of fetchers) {
      const s = setup(f as never);
      const err = await s.p.handle(job(2)).catch((e: unknown) => e as Error);
      expect((err as Error).message).toBe('PDF_UNAVAILABLE');
      expect(JSON.stringify(s.jobs.fail.mock.calls)).not.toContain('SECRETO');
    }
  });

  it('RF-58: PDF_TOO_LARGE no se reintenta (declarado o real)', async () => {
    const declared = setup(
      (async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(MAX_PDF_BYTES + 1) },
        })) as never,
    );
    const err = await declared.p.handle(job(0)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnrecoverableError);
    expect(declared.jobs.fail).toHaveBeenCalledWith('b1', 'PDF_TOO_LARGE');

    const real = setup(
      (async () =>
        new Response(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES)]))) as never,
    );
    await expect(real.p.handle(job(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(real.jobs.fail).toHaveBeenCalledWith('b1', 'PDF_TOO_LARGE');
  });

  it('RF-58: justo en el tope de 20 MiB todavía pasa', async () => {
    const edge = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES - 5)]);
    const s = setup((async () => new Response(edge)) as never);
    await s.p.handle(job(0));
    expect(s.jobs.succeed).toHaveBeenCalled();
  });

  it('RF-58: PDF_INVALID (no empieza con %PDF-) se reintenta y termina FAILED', async () => {
    const s = setup((async () => new Response('<html>error</html>', { status: 200 })) as never);
    await expect(s.p.handle(job(0))).rejects.toThrow('PDF_INVALID');
    expect(s.jobs.fail).not.toHaveBeenCalled();
    await expect(s.p.handle(job(2))).rejects.toThrow('PDF_INVALID');
    expect(s.jobs.fail).toHaveBeenCalledWith('b1', 'PDF_INVALID');
  });

  it('RF-58: no sigue redirecciones', async () => {
    const f = vi.fn(async () => new Response('%PDF-1'));
    await new GotenbergClient({ GOTENBERG_URL: 'http://127.0.0.1:3001' })
      .useFetch(f as never)
      .htmlToPdf('x');
    expect((f.mock.calls[0] as unknown as [URL, RequestInit])[1].redirect).toBe('error');
  });
});

describe('RF-59: ZIP masivo', () => {
  const refs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      section: { gradeLevel: 1 + (i % 5), code: `S${Math.floor(i / 5)}` },
    }));
  const started = (format: string) =>
    ({
      id: 'j',
      type: 'BULK_EXPORT',
      params: { academicYearId: 'y', periodId: 'p', format },
      attempts: 1,
    }) as never;

  function collector() {
    const out: { buf: Buffer | null } = { buf: null };
    const upload = vi.fn(async (_k: string, body: NodeJS.ReadableStream) => {
      const chunks: Buffer[] = [];
      for await (const c of body) chunks.push(c as Buffer);
      out.buf = Buffer.concat(chunks);
      return out.buf.length;
    });
    return { out, upload };
  }

  function proc(list: unknown[], r: unknown, upload: unknown) {
    return new BulkExportProcessor(
      null as never,
      null as never,
      r as never,
      { courseSections: vi.fn().mockResolvedValue(list) } as unknown as ReportsDataService,
      { upload } as never,
    );
  }

  it('RF-59: con PDF arma un ZIP de .pdf por sección', async () => {
    const c = collector();
    const r = renderer({});
    const res = await proc(refs(2), r.svc, c.upload).work(
      started('PDF'),
      new Date('2026-05-10T15:00:00Z'),
    );
    const entries = readZip(c.out.buf!);
    expect([...entries.keys()].sort()).toEqual([
      '1.º S0/Matemática - Bimestre 1.pdf',
      '2.º S0/Matemática - Bimestre 1.pdf',
    ]);
    for (const f of entries.values()) expect(f.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.bytes).toBe(c.out.buf!.length);
    expect(res.objectKey).toMatch(/\.zip$/);
  });

  it('RF-59: 300 cursos-sección pasa; 301 falla BULK_TOO_LARGE sin renderizar ni subir', async () => {
    const c = collector();
    const ok = renderer({});
    ok.svc.render = vi.fn().mockResolvedValue(Buffer.from('x'));
    await proc(refs(MAX_REPORT_COURSE_SECTIONS), ok.svc, c.upload).work(started('XLSX'));
    expect(readZip(c.out.buf!).size).toBe(300);

    const big = renderer({});
    const bigRender = vi.fn();
    big.svc.render = bigRender;
    const up = collector();
    await expect(
      proc(refs(MAX_REPORT_COURSE_SECTIONS + 1), big.svc, up.upload).work(started('XLSX')),
    ).rejects.toMatchObject({ code: 'BULK_TOO_LARGE', retryable: false });
    expect(bigRender).not.toHaveBeenCalled();
    expect(up.upload).not.toHaveBeenCalled();
  }, 30_000);

  it('RF-59: el tope es 200 MiB; en el límite pasa y un byte más falla', async () => {
    expect(MAX_BULK_BYTES).toBe(200 * 1024 * 1024);
    const stub = (size: number) => ({
      institution: vi.fn().mockResolvedValue(NO_LOGO),
      sectionData: vi.fn().mockResolvedValue({ course: 'C', period: 'P' }),
      render: vi.fn().mockResolvedValue(Buffer.alloc(size)),
    });
    await proc(refs(2), stub(500), collector().upload).work(started('XLSX'), new Date(), 1000);
    await expect(
      proc(refs(2), stub(501), collector().upload).work(started('XLSX'), new Date(), 1000),
    ).rejects.toMatchObject({ code: 'BULK_TOO_LARGE', retryable: false });
    // Con el tope real: dos archivos de 101 MiB suman más de 200 MiB.
    await expect(
      proc(refs(2), stub(101 * 1024 * 1024), collector().upload).work(started('XLSX')),
    ).rejects.toMatchObject({ code: 'BULK_TOO_LARGE' });
  }, 60_000);

  it('RF-59: NO_COURSE_SECTIONS antes de leer el logo; parámetros inválidos son INVALID_PARAMS', async () => {
    const r = { institution: vi.fn(), sectionData: vi.fn(), render: vi.fn() };
    await expect(proc([], r, vi.fn()).work(started('XLSX'))).rejects.toMatchObject({
      code: 'NO_COURSE_SECTIONS',
      retryable: false,
    });
    expect(r.institution).not.toHaveBeenCalled();
    await expect(proc(refs(1), r, vi.fn()).work(started('CSV'))).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      retryable: false,
    });
    await expect(
      proc(refs(1), r, vi.fn()).work({ params: { periodId: 'p', format: 'XLSX' } } as never),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  });

  it('RF-59: si una sección ya no existe el trabajo falla sin reintentar', async () => {
    const r = renderer({
      gradebook: () => Promise.reject(Object.assign(new Error('x'), { status: 404 })),
    });
    await expect(
      proc(refs(1), r.svc, collector().upload).work(started('XLSX')),
    ).rejects.toMatchObject({ code: 'REPORT_SOURCE_NOT_FOUND', retryable: false });
  });
});

describe('RF-60: dashboard', () => {
  function item(grade: number, sectionId: string, code: string, ne: number): DashboardInput {
    return {
      gradeLevel: grade,
      sectionId,
      code,
      students: [
        { studentId: `${sectionId}-1`, atRisk: ne > 0, cells: [] },
        { studentId: `${sectionId}-2`, atRisk: false, cells: [] },
      ],
      dashboard: {
        riskLiteral: 'C',
        distribution: { AD: 1, A: 0, B: 0, C: ne },
        noGrades: 1,
        atRisk: Array.from({ length: ne }, (_, i) => ({ enrollmentId: `e${i}` })),
        counts: { onTime: 2, late: 1, ne },
      } as never,
    };
  }

  it('RF-60: el total de cada grado y del año es la suma de sus secciones', () => {
    const items = [
      item(1, 's1', 'A', 2),
      item(1, 's2', 'B', 1),
      item(2, 's3', 'A', 0),
      item(2, 's3', 'A', 3),
    ];
    const r = aggregateDashboard(items, DEFAULT_LITERAL_SCALE);
    type B = (typeof r)['total'];
    const sum = (f: (b: B) => number, list: B[]) => list.reduce((s, b) => s + f(b), 0);
    for (const g of r.grades) {
      for (const k of ['courseSections', 'noGrades', 'atRiskEntries', 'students'] as const) {
        expect(g[k]).toBe(sum((b) => b[k], g.sections));
      }
      for (const k of ['onTime', 'late', 'ne'] as const) {
        expect(g.counts[k]).toBe(sum((b) => b.counts[k], g.sections));
      }
      for (const lit of r.literals) {
        expect(g.distribution[lit]).toBe(sum((b) => b.distribution[lit], g.sections));
      }
    }
    for (const k of ['courseSections', 'noGrades', 'atRiskEntries', 'students'] as const) {
      expect(r.total[k]).toBe(sum((b) => b[k], r.grades));
    }
    for (const lit of r.literals) {
      expect(r.total.distribution[lit]).toBe(sum((b) => b.distribution[lit], r.grades));
    }
    expect(r.total.counts).toEqual({ onTime: 8, late: 4, ne: 6 });
  });

  function service(count: number, view?: unknown) {
    const list = Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      section: { id: 's1', gradeLevel: 1, code: 'A' },
    }));
    const data = {
      year: vi.fn().mockResolvedValue({ id: 'y', year: 2026 }),
      period: vi.fn().mockResolvedValue({ id: 'p', label: 'P1', sequence: 1 }),
      courseSections: vi.fn().mockResolvedValue(list),
      countCourseSections: vi.fn().mockResolvedValue(count),
      sectionGradebook: vi.fn().mockResolvedValue({ view: view ?? book().view }),
    };
    const jobs = { create: vi.fn().mockResolvedValue({ id: 'job', type: 'BULK_EXPORT' }) };
    const scales = { current: vi.fn().mockResolvedValue(DEFAULT_LITERAL_SCALE) };
    const audit = { record: vi.fn(), log: vi.fn() };
    return {
      data,
      jobs,
      svc: new ReportsService(
        {} as never,
        data as never,
        jobs as never,
        scales as never,
        audit as never,
      ),
    };
  }

  const q = { academicYearId: 'y', periodId: 'p' };

  it('RF-60: REPORT_TOO_LARGE con 301 cursos-sección, sin leer registros; 300 pasa', async () => {
    const over = service(301);
    const err = await over.svc.dashboard(q).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'REPORT_TOO_LARGE',
    });
    expect(over.data.sectionGradebook).not.toHaveBeenCalled();

    const ok = service(300);
    const res = await ok.svc.dashboard({ ...q, gradeLevel: 1 });
    expect(res.total.courseSections).toBe(300);
    expect(ok.data.sectionGradebook).toHaveBeenCalledTimes(300);
  });

  it('RF-60: más de 60 cursos-sección sin grado es 422 REPORT_NEEDS_GRADE_FILTER; con grado pasa', async () => {
    const big = service(61);
    const err = await big.svc.dashboard(q).catch((e: unknown) => e);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'REPORT_NEEDS_GRADE_FILTER',
    });
    expect(big.data.sectionGradebook).not.toHaveBeenCalled();
    const filtered = await service(61).svc.dashboard({ ...q, gradeLevel: 2 });
    expect(filtered.total.courseSections).toBe(61);
    expect((await service(60).svc.dashboard(q)).total.courseSections).toBe(60);
  });

  it('RF-60: el dashboard no filtra nombres ni ids de estudiantes', async () => {
    const v = book({
      students: [
        {
          studentId: 'stu-9',
          fullName: 'Ana Secreta',
          isCurrent: true,
          average: { status: 'NO_GRADES', counted: 0, exempt: 0 },
          atRisk: true,
          cells: [],
        },
      ],
    }).view;
    (v as { dashboard: unknown }).dashboard = {
      riskLiteral: 'C',
      distribution: {},
      noGrades: 1,
      atRisk: [],
      counts: { onTime: 0, late: 0, ne: 0 },
    };
    const res = await service(1, v).svc.dashboard(q);
    expect(res.total.students).toBe(1);
    expect(res.total.atRiskStudents).toBe(1);
    expect(JSON.stringify(res)).not.toMatch(/Secreta|stu-9/);
  });

  it('RF-59: requestExport BULK, NO_COURSE_SECTIONS y REPORT_TOO_LARGE son 422 y no encolan', async () => {
    const body = {
      type: 'BULK_EXPORT',
      academicYearId: 'y',
      periodId: 'p',
      format: 'PDF',
    } as const;
    const actor = { id: 'a', role: 'ADMIN' } as never;
    const none = service(0);
    await expect(none.svc.requestExport(body, actor)).rejects.toMatchObject({
      response: { code: 'NO_COURSE_SECTIONS' },
    });
    const many = service(301);
    await expect(many.svc.requestExport(body, actor)).rejects.toMatchObject({
      response: { code: 'REPORT_TOO_LARGE' },
    });
    expect(none.jobs.create).not.toHaveBeenCalled();
    expect(many.jobs.create).not.toHaveBeenCalled();
    const exact = service(300);
    await exact.svc.requestExport(body, actor);
    expect(exact.jobs.create).toHaveBeenCalledTimes(1);
  });

  it('RF-58: requestExport SECTION con curso-sección inexistente es 404', async () => {
    const s = service(1);
    const svc = new ReportsService(
      { courseSection: { findUnique: vi.fn().mockResolvedValue(null) } } as never,
      s.data as never,
      s.jobs as never,
      {} as never,
      {} as never,
    );
    await expect(
      svc.requestExport(
        { type: 'SECTION_EXPORT', courseSectionId: 'x', periodId: 'p', format: 'XLSX' },
        { id: 'a', role: 'ADMIN' } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s.jobs.create).not.toHaveBeenCalled();
  });
});

describe('ReportsDataService: año, período y registro', () => {
  const svc = (period: unknown, year: unknown = { id: 'y' }) =>
    new ReportsDataService(
      {
        academicPeriod: { findUnique: vi.fn().mockResolvedValue(period) },
        academicYear: { findUnique: vi.fn().mockResolvedValue(year) },
      } as never,
      {} as never,
      {} as never,
    );

  it('RF-58: período de otro año es 422 PERIOD_MISMATCH', async () => {
    const err = await svc({ id: 'p', label: 'x', sequence: 1, academicYearId: 'otro' })
      .period('y', 'p')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'PERIOD_MISMATCH',
    });
  });

  it('RF-58: período o año inexistente es 404', async () => {
    await expect(svc(null).period('y', 'p')).rejects.toMatchObject({
      response: { code: 'PERIOD_NOT_FOUND' },
    });
    await expect(svc(null, null).year('y')).rejects.toMatchObject({
      response: { code: 'YEAR_NOT_FOUND' },
    });
  });

  it('RF-58: sectionGradebook con período ajeno o curso ausente da 404 con su código', async () => {
    const mk = (ctx: () => Promise<unknown>) =>
      new ReportsDataService({} as never, { getCourseSectionContext: ctx } as never, {} as never);
    await expect(
      mk(() =>
        Promise.resolve({ periods: [{ id: 'a' }], academicYear: { year: 1 }, teacher: null }),
      ).sectionGradebook('c', 'b'),
    ).rejects.toMatchObject({ response: { code: 'PERIOD_NOT_FOUND' } });
    await expect(
      mk(() => Promise.reject(new NotFoundException())).sectionGradebook('c', 'b'),
    ).rejects.toMatchObject({ response: { code: 'COURSE_SECTION_NOT_FOUND' } });
    const other = new Error('otro');
    await expect(mk(() => Promise.reject(other)).sectionGradebook('c', 'b')).rejects.toBe(other);
  });

  it('JobError es reintentable por defecto', () => {
    expect(new JobError('X').retryable).toBe(true);
  });
});
