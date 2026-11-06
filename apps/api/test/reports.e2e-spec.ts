import { fileURLToPath } from 'node:url';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import type { Job } from 'bullmq';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { ENV } from './../src/config/config.module.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  JobResultStorage,
  MAX_ACTIVE_JOBS_PER_REQUESTER,
  type TrackedJobData,
  TrackedJobRunner,
} from './../src/modules/jobs/index.js';
import { readZip } from './../src/modules/jobs/zip-reader.mock-spec.js';
import { QueueService } from './../src/modules/queue/index.js';
import { GotenbergClient, type PdfRenderer } from './../src/modules/reports/gotenberg.client.js';
import { BulkExportProcessor } from './../src/modules/reports/processors/bulk-export.processor.js';
import { SectionExportProcessor } from './../src/modules/reports/processors/section-export.processor.js';
import { ReportRendererService } from './../src/modules/reports/report-renderer.service.js';
import { XLSX_SHEET, XLSX_TABLE_ROW } from './../src/modules/reports/report-xlsx.js';
import { ReportsDataService } from './../src/modules/reports/reports-data.service.js';
import { InstitutionLogoStorage } from './../src/modules/settings/institution-logo.storage.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 5f de Dev 5 (RF-57..60) contra MySQL y MinIO reales (solo local con Docker). Redis no se
// usa: se espía QueueService.enqueue y los procesadores corren a mano con el TrackedJobRunner
// real. El PDF usa Gotenberg si responde en GOTENBERG_URL; si no, un renderizador falso.
// Crea un año ficticio 2093 con dos secciones de 1.er grado y lo borra al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const QA_YEAR = 2093;
const DAY = 86_400_000;
const PREFIX = 'QA-5F ';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

const fakeJob = (backgroundJobId: string) =>
  ({ data: { backgroundJobId }, opts: { attempts: 1 }, attemptsMade: 0 }) as Job<TrackedJobData>;

async function gotenbergUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe.skipIf(!process.env.DATABASE_URL)('Reportes 5f (e2e, MySQL + MinIO)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let sink: MemoryAuditSink;
  let enqueue: ReturnType<typeof vi.spyOn>;
  let sectionProcessor: SectionExportProcessor;
  let bulkProcessor: BulkExportProcessor;
  let pdfRenderer: PdfRenderer;
  let realPdf = false;

  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  let yearId: string;
  let periodId: string;
  let otherPeriodId: string;
  let sectionA: string;
  let sectionB: string;
  let csA1: string;
  let courseName: string;

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string | null, url: string) => {
    const req = http().get(API + url);
    return key ? req.set('Cookie', as(key)) : req;
  };
  const post = (key: string | null, url: string, body: object) => {
    const req = http().post(API + url);
    return key ? req.set('Cookie', as(key)).send(body) : req.send(body);
  };
  const download = async (jobId: string) => {
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe('SUCCEEDED');
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: row.resultObjectKey! }));
    return Buffer.from(await res.Body!.transformToByteArray());
  };

  const cleanAdminJobs = async () => {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        OR: [
          { requestedById: ids.get('admin'), status: { in: ['QUEUED', 'RUNNING'] } },
          { type: { in: ['SECTION_EXPORT', 'BULK_EXPORT'] }, academicYearId: yearId ?? '-' },
        ],
      },
      select: { id: true, resultObjectKey: true },
    });
    const results = app.get(JobResultStorage, { strict: false });
    for (const r of rows) {
      if (r.resultObjectKey) await results.delete(r.resultObjectKey).catch(() => undefined);
    }
    await prisma.backgroundJob.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  };

  const cleanYear = async () => {
    const year = await prisma.academicYear.findUnique({ where: { year: QA_YEAR } });
    if (!year) return;
    yearId = year.id;
    await cleanAdminJobs();
    await prisma.grade.deleteMany({
      where: { assignment: { courseSection: { section: { academicYearId: year.id } } } },
    });
    await prisma.assignment.deleteMany({
      where: { courseSection: { section: { academicYearId: year.id } } },
    });
    await prisma.enrollment.deleteMany({ where: { academicYearId: year.id } });
    await prisma.courseSection.deleteMany({ where: { section: { academicYearId: year.id } } });
    await prisma.section.deleteMany({ where: { academicYearId: year.id } });
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: year.id } });
    await prisma.academicYear.delete({ where: { id: year.id } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const storage = loadStorageConfig();
    bucket = storage.bucket;
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    });

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    enqueue = vi
      .spyOn(app.get(QueueService, { strict: false }), 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));

    // El límite de 10 solicitudes por minuto se desactiva: los casos piden más de 10 exportaciones.
    vi.spyOn(app.get(ThrottlerStorage, { strict: false }), 'increment').mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const env = app.get(ENV, { strict: false }) as { GOTENBERG_URL: string };
    realPdf = await gotenbergUp(env.GOTENBERG_URL);
    pdfRenderer = realPdf
      ? new GotenbergClient(env)
      : { htmlToPdf: () => Promise.resolve(Buffer.from('%PDF-1.4 falso')) };

    const results = app.get(JobResultStorage, { strict: false });
    const runner = app.get(TrackedJobRunner, { strict: false });
    const data = app.get(ReportsDataService, { strict: false });
    const renderer = new ReportRendererService(
      app.get(PrismaService, { strict: false }),
      data,
      app.get(InstitutionLogoStorage, { strict: false }),
      pdfRenderer,
    );
    sectionProcessor = new SectionExportProcessor(null as never, runner, renderer, results);
    bulkProcessor = new BulkExportProcessor(null as never, runner, renderer, data, results);

    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01', 'estudiante02', 'estudiante03']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    await cleanYear();

    // Año 2093 (no activo) con dos períodos, 1.º A (dos cursos) y 1.º B (un curso).
    const year = await prisma.academicYear.create({ data: { year: QA_YEAR } });
    yearId = year.id;
    periodId = (
      await prisma.academicPeriod.create({
        data: {
          academicYearId: yearId,
          sequence: 1,
          kind: 'FIRST_BIMESTER',
          label: 'I Bimestre',
          startDate: new Date(`${QA_YEAR}-03-01`),
          endDate: new Date(`${QA_YEAR}-05-15`),
        },
      })
    ).id;
    otherPeriodId = (
      await prisma.academicPeriod.create({
        data: {
          academicYearId: yearId,
          sequence: 2,
          kind: 'SECOND_BIMESTER',
          label: 'II Bimestre',
          startDate: new Date(`${QA_YEAR}-05-20`),
          endDate: new Date(`${QA_YEAR}-07-20`),
        },
      })
    ).id;
    sectionA = (
      await prisma.section.create({ data: { academicYearId: yearId, gradeLevel: 1, code: 'A' } })
    ).id;
    sectionB = (
      await prisma.section.create({ data: { academicYearId: yearId, gradeLevel: 1, code: 'B' } })
    ).id;
    const courses = await prisma.course.findMany({ orderBy: { name: 'asc' }, take: 2 });
    courseName = courses[0].name;
    csA1 = (
      await prisma.courseSection.create({
        data: { sectionId: sectionA, courseId: courses[0].id, teacherId: ids.get('docente01') },
      })
    ).id;
    await prisma.courseSection.create({ data: { sectionId: sectionA, courseId: courses[1].id } });
    await prisma.courseSection.create({ data: { sectionId: sectionB, courseId: courses[0].id } });

    const from = new Date(Date.now() - 30 * DAY);
    const enroll = (student: string, sectionId: string) =>
      prisma.enrollment.create({
        data: {
          studentId: ids.get(student)!,
          sectionId,
          academicYearId: yearId,
          effectiveFrom: from,
        },
      });
    const e1 = await enroll('estudiante01', sectionA);
    await enroll('estudiante02', sectionA);
    await enroll('estudiante03', sectionB);

    const assignment = await prisma.assignment.create({
      data: {
        courseSectionId: csA1,
        periodId,
        title: `=${PREFIX}Tarea`,
        instructions: 'PDF',
        dueAt: new Date(Date.now() - DAY),
        noSubmissionGrade: 0,
        createdById: ids.get('docente01')!,
      },
    });
    await prisma.grade.create({
      data: {
        assignmentId: assignment.id,
        enrollmentId: e1.id,
        state: 'GRADED',
        value: 18,
        gradedAt: new Date(),
      },
    });
  });

  beforeEach(async () => {
    await cleanAdminJobs();
    enqueue.mockClear();
    sink.records.length = 0;
  });

  afterAll(async () => {
    try {
      if (prisma && app) await cleanYear();
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  });

  describe('permisos (solo ADMIN)', () => {
    it('docente y estudiante reciben 403; sin sesión, 401', async () => {
      const body = { type: 'SECTION_EXPORT', courseSectionId: csA1, periodId, format: 'XLSX' };
      for (const key of ['docente01', 'estudiante01']) {
        await get(key, '/admin/reports/course-sections').expect(403);
        await get(
          key,
          `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${periodId}`,
        ).expect(403);
        await post(key, '/admin/exports', body).expect(403);
      }
      await get(null, '/admin/reports/course-sections').expect(401);
      await post(null, '/admin/exports', body).expect(401);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('RF-57: cursos-sección con docente', () => {
    it('lista el año con filtros por grado y sección', async () => {
      const res = await get(
        'admin',
        `/admin/reports/course-sections?academicYearId=${yearId}`,
      ).expect(200);
      expect(res.body.academicYear).toMatchObject({ id: yearId, year: QA_YEAR });
      expect(res.body.periods.map((p: { id: string }) => p.id)).toEqual([periodId, otherPeriodId]);
      expect(res.body.sections).toHaveLength(2);
      expect(res.body.items).toHaveLength(3);
      const a1 = res.body.items.find(
        (i: { courseSectionId: string }) => i.courseSectionId === csA1,
      );
      expect(a1.teacher).toEqual({ id: ids.get('docente01'), fullName: expect.any(String) });

      const bySection = await get(
        'admin',
        `/admin/reports/course-sections?academicYearId=${yearId}&sectionId=${sectionB}`,
      ).expect(200);
      expect(bySection.body.items).toHaveLength(1);
      const byGrade = await get(
        'admin',
        `/admin/reports/course-sections?academicYearId=${yearId}&gradeLevel=2`,
      ).expect(200);
      expect(byGrade.body.items).toHaveLength(0);
      await get('admin', '/admin/reports/course-sections?gradeLevel=x').expect(400);
    });

    it('el ADMIN ve el registro de cualquier curso-sección (endpoint de Dev 4)', async () => {
      const res = await get(
        'admin',
        `/course-sections/${csA1}/gradebook?periodId=${periodId}`,
      ).expect(200);
      expect(res.body.students).toHaveLength(2);
    });
  });

  describe('RF-60: dashboard', () => {
    it('agrega por grado y sección con el motor, sin nombres', async () => {
      const res = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${periodId}`,
      ).expect(200);
      expect(res.body.literals).toEqual(['AD', 'A', 'B', 'C']);
      expect(res.body.grades).toHaveLength(1);
      const [grade] = res.body.grades;
      expect(grade.gradeLevel).toBe(1);
      const a = grade.sections.find((s: { code: string }) => s.code === 'A');
      // 18 de estudiante01 (AD) y NE virtual 0 de estudiante02 (C, en riesgo).
      expect(a.distribution).toMatchObject({ AD: 1, C: 1 });
      expect(a.counts).toEqual({ onTime: 0, late: 0, ne: 1 });
      expect(a.atRiskStudents).toBe(1);
      expect(a.average).toMatchObject({ status: 'OK', rounded: 9, literal: 'C' });
      expect(res.body.total.courseSections).toBe(3);
      expect(JSON.stringify(res.body)).not.toContain(ids.get('estudiante02')!);

      await get('admin', `/admin/reports/dashboard?academicYearId=${yearId}`).expect(400);
      const foreign = await prisma.academicPeriod.findFirst({
        where: { academicYearId: { not: yearId } },
      });
      if (foreign) {
        await get(
          'admin',
          `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${foreign.id}`,
        ).expect(422);
      }
    });
  });

  describe('RF-58: exportación de una sección', () => {
    it('XLSX: 202 con jobId, bitácora, y el archivo abre con exceljs con las celdas esperadas', async () => {
      const res = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csA1,
        periodId,
        format: 'XLSX',
      }).expect(202);
      expect(res.body.jobId).toBe(res.body.job.id);
      expect(res.body.job.status).toBe('QUEUED');
      expect(enqueue).toHaveBeenCalledWith(
        'exports',
        'section-export',
        { backgroundJobId: res.body.jobId },
        { jobId: res.body.jobId },
      );
      const audit = sink.records.filter((r) => r.action === 'reports.export.request');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ module: 'reports', entityId: csA1 });

      await sectionProcessor.handle(fakeJob(res.body.jobId));
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await download(res.body.jobId)) as unknown as ExcelJS.Buffer);
      const ws = wb.getWorksheet(XLSX_SHEET)!;
      expect(ws.getCell('B2').value).toBe(`Curso: ${courseName}`);
      expect(ws.getCell('B3').value as string).toMatch(/^Docente: /);
      expect(ws.getCell('B4').value).toBe(`Sección: 1.º A (${QA_YEAR})`);
      expect(ws.getCell('B5').value).toBe('Período: I Bimestre');
      expect(ws.getRow(XLSX_TABLE_ROW).getCell(3).value).toBe(`'=${PREFIX}Tarea`);
      const values = [1, 2].map((i) => ws.getRow(XLSX_TABLE_ROW + i).getCell(3).value);
      expect(values).toEqual(expect.arrayContaining([18, 'NE 0.00']));

      const job = await get('admin', `/admin/jobs/${res.body.jobId}`).expect(200);
      expect(job.body).toMatchObject({ status: 'SUCCEEDED', hasResult: true });
    });

    it(`PDF (${'Gotenberg o renderizador falso'}): el resultado es un PDF`, async () => {
      const res = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csA1,
        periodId,
        format: 'PDF',
      }).expect(202);
      await sectionProcessor.handle(fakeJob(res.body.jobId));
      const pdf = await download(res.body.jobId);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      if (realPdf) expect(pdf.length).toBeGreaterThan(1000);
    });

    it('valida el cuerpo, el curso-sección y el período', async () => {
      const base = { type: 'SECTION_EXPORT', courseSectionId: csA1, periodId, format: 'XLSX' };
      await post('admin', '/admin/exports', { ...base, format: 'CSV' }).expect(400);
      await post('admin', '/admin/exports', { ...base, extra: 1 }).expect(400);
      await post('admin', '/admin/exports', { ...base, type: 'YEAR_BACKUP' }).expect(400);
      await post('admin', '/admin/exports', {
        ...base,
        courseSectionId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
      const foreign = await prisma.academicPeriod.findFirst({
        where: { academicYearId: { not: yearId } },
      });
      if (foreign) {
        await post('admin', '/admin/exports', { ...base, periodId: foreign.id }).expect(422);
      }
      expect(enqueue).not.toHaveBeenCalled();
    });

    it(`JOB_LIMIT: con ${MAX_ACTIVE_JOBS_PER_REQUESTER} trabajos activos responde 429`, async () => {
      const body = { type: 'SECTION_EXPORT', courseSectionId: csA1, periodId, format: 'XLSX' };
      for (let i = 0; i < MAX_ACTIVE_JOBS_PER_REQUESTER; i++) {
        await post('admin', '/admin/exports', body).expect(202);
      }
      const res = await post('admin', '/admin/exports', body).expect(429);
      expect(res.body.error.code).toBe('JOB_LIMIT');
    });
  });

  describe('RF-59: ZIP de todas las secciones', () => {
    it('BULK_EXPORT genera un ZIP con un archivo por curso-sección', async () => {
      const res = await post('admin', '/admin/exports', {
        type: 'BULK_EXPORT',
        academicYearId: yearId,
        periodId,
        format: 'XLSX',
      }).expect(202);
      expect(enqueue).toHaveBeenCalledWith(
        'exports',
        'bulk-export',
        { backgroundJobId: res.body.jobId },
        { jobId: res.body.jobId },
      );
      await bulkProcessor.handle(fakeJob(res.body.jobId));
      const entries = readZip(await download(res.body.jobId));
      expect(entries.size).toBe(3);
      const names = [...entries.keys()];
      expect(names.filter((n) => n.startsWith('1.º A/'))).toHaveLength(2);
      expect(names.every((n) => n.endsWith(' - I Bimestre.xlsx'))).toBe(true);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(entries.get(names[0])! as unknown as ExcelJS.Buffer);
      expect(wb.getWorksheet(XLSX_SHEET)).toBeDefined();
    });

    it('valida año y período', async () => {
      await post('admin', '/admin/exports', {
        type: 'BULK_EXPORT',
        academicYearId: '00000000-0000-4000-8000-000000000000',
        periodId,
        format: 'PDF',
      }).expect(404);
    });
  });
});
