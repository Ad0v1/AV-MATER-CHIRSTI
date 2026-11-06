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
import { PrismaService } from './../src/common/prisma/prisma.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { ENV } from './../src/config/config.module.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  JobResultStorage,
  type TrackedJobData,
  TrackedJobRunner,
} from './../src/modules/jobs/index.js';
import { QueueService } from './../src/modules/queue/index.js';
import { GotenbergClient, type PdfRenderer } from './../src/modules/reports/gotenberg.client.js';
import { SectionExportProcessor } from './../src/modules/reports/processors/section-export.processor.js';
import { ReportRendererService } from './../src/modules/reports/report-renderer.service.js';
import { XLSX_SHEET, XLSX_TABLE_ROW } from './../src/modules/reports/report-xlsx.js';
import { ReportsDataService } from './../src/modules/reports/reports-data.service.js';
import { InstitutionLogoStorage } from './../src/modules/settings/institution-logo.storage.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp } from './helpers.js';

// Fase 5f, casos límite (RF-57..60) contra MySQL y MinIO reales (solo local con Docker).
// Año ficticio 2092 con: 1.º A (curso con docente, 2 estudiantes y 1 tarea; curso con docente,
// sin tareas), 1.º B (curso sin docente y sin estudiantes) y 2091 (período, sin cursos-sección).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const YEAR = 2092;
const EMPTY_YEAR = 2091;
const DAY = 86_400_000;
const NIL = '00000000-0000-4000-8000-000000000000';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

const fakeJob = (backgroundJobId: string) =>
  ({ data: { backgroundJobId }, opts: { attempts: 1 }, attemptsMade: 0 }) as Job<TrackedJobData>;

async function gotenbergUp(url: string): Promise<boolean> {
  try {
    return (await fetch(new URL('/health', url), { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

describe.skipIf(!process.env.DATABASE_URL)('Reportes 5f: casos límite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let enqueue: ReturnType<typeof vi.spyOn>;
  let processor: SectionExportProcessor;
  let realPdf = false;

  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const cookies = new Map<string, string>();
  let yearId: string;
  let emptyYearId: string;
  let periodId: string;
  let emptyYearPeriodId: string;
  let csTasks: string;
  let csNoTasks: string;
  let csNoTeacher: string;

  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string | null, url: string) => {
    const req = request(app.getHttpServer()).get(API + url);
    return key ? req.set('Cookie', as(key)) : req;
  };
  const post = (key: string | null, url: string, body: object) => {
    const req = request(app.getHttpServer()).post(API + url);
    return key ? req.set('Cookie', as(key)).send(body) : req.send(body);
  };
  const run = async (body: object) => {
    const res = await post('admin', '/admin/exports', body).expect(202);
    await processor.handle(fakeJob(res.body.jobId));
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: res.body.jobId } });
    expect(row.status).toBe('SUCCEEDED');
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: row.resultObjectKey! }));
    return Buffer.from(await obj.Body!.transformToByteArray());
  };
  const xlsx = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    return wb.getWorksheet(XLSX_SHEET)!;
  };

  const cleanYears = async () => {
    for (const year of await prisma.academicYear.findMany({
      where: { year: { in: [YEAR, EMPTY_YEAR] } },
    })) {
      const jobs = await prisma.backgroundJob.findMany({
        where: { OR: [{ academicYearId: year.id }, { requestedById: ids.get('admin') ?? '-' }] },
        select: { id: true, resultObjectKey: true },
      });
      const results = app.get(JobResultStorage, { strict: false });
      for (const j of jobs) {
        if (j.resultObjectKey) await results.delete(j.resultObjectKey).catch(() => undefined);
      }
      await prisma.backgroundJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
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
    }
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
    enqueue = vi
      .spyOn(app.get(QueueService, { strict: false }), 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));
    // El throttle real se prueba en reports-throttle.e2e-spec.ts.
    vi.spyOn(app.get(ThrottlerStorage, { strict: false }), 'increment').mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const env = app.get(ENV, { strict: false }) as { GOTENBERG_URL: string };
    realPdf = await gotenbergUp(env.GOTENBERG_URL);
    const pdf: PdfRenderer = realPdf
      ? new GotenbergClient(env)
      : { htmlToPdf: () => Promise.resolve(Buffer.from('%PDF-1.4 falso')) };
    const renderer = new ReportRendererService(
      app.get(PrismaService, { strict: false }),
      app.get(ReportsDataService, { strict: false }),
      app.get(InstitutionLogoStorage, { strict: false }),
      pdf,
    );
    processor = new SectionExportProcessor(
      null as never,
      app.get(TrackedJobRunner, { strict: false }),
      renderer,
      app.get(JobResultStorage, { strict: false }),
    );

    const sessions = app.get(SessionService);
    for (const key of [
      'admin',
      'docente01',
      'docente02',
      'estudiante01',
      'estudiante02',
      'apoderado01',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      names.set(key, user.fullName);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    await cleanYears();
    yearId = (await prisma.academicYear.create({ data: { year: YEAR } })).id;
    emptyYearId = (await prisma.academicYear.create({ data: { year: EMPTY_YEAR } })).id;
    periodId = (
      await prisma.academicPeriod.create({
        data: {
          academicYearId: yearId,
          sequence: 1,
          kind: 'FIRST_BIMESTER',
          label: 'I Bimestre',
          startDate: new Date(`${YEAR}-03-01`),
          endDate: new Date(`${YEAR}-05-15`),
        },
      })
    ).id;
    emptyYearPeriodId = (
      await prisma.academicPeriod.create({
        data: {
          academicYearId: emptyYearId,
          sequence: 1,
          kind: 'FIRST_BIMESTER',
          label: 'I Bimestre',
          startDate: new Date(`${EMPTY_YEAR}-03-01`),
          endDate: new Date(`${EMPTY_YEAR}-05-15`),
        },
      })
    ).id;
    const a = await prisma.section.create({
      data: { academicYearId: yearId, gradeLevel: 1, code: 'A' },
    });
    const b = await prisma.section.create({
      data: { academicYearId: yearId, gradeLevel: 1, code: 'B' },
    });
    const courses = await prisma.course.findMany({ orderBy: { name: 'asc' }, take: 3 });
    csTasks = (
      await prisma.courseSection.create({
        data: { sectionId: a.id, courseId: courses[0].id, teacherId: ids.get('docente01') },
      })
    ).id;
    csNoTasks = (
      await prisma.courseSection.create({
        data: { sectionId: a.id, courseId: courses[1].id, teacherId: ids.get('docente01') },
      })
    ).id;
    csNoTeacher = (
      await prisma.courseSection.create({ data: { sectionId: b.id, courseId: courses[0].id } })
    ).id;

    const from = new Date(Date.now() - 30 * DAY);
    const e1 = await prisma.enrollment.create({
      data: {
        studentId: ids.get('estudiante01')!,
        sectionId: a.id,
        academicYearId: yearId,
        effectiveFrom: from,
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: ids.get('estudiante02')!,
        sectionId: a.id,
        academicYearId: yearId,
        effectiveFrom: from,
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        courseSectionId: csTasks,
        periodId,
        title: '=Tarea 1',
        instructions: 'x',
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
        value: 14,
        gradedAt: new Date(),
      },
    });
  });

  beforeEach(() => enqueue.mockClear());

  afterAll(async () => {
    try {
      if (prisma && app) await cleanYears();
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  });

  describe('permisos: solo ADMIN en los tres endpoints', () => {
    it.each(['docente01', 'estudiante01', 'apoderado01'])(
      'RF-57..60: %s recibe 403 y no se encola nada',
      async (key) => {
        await get(key, '/admin/reports/course-sections').expect(403);
        await get(
          key,
          `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${periodId}`,
        ).expect(403);
        await post(key, '/admin/exports', {
          type: 'SECTION_EXPORT',
          courseSectionId: csTasks,
          periodId,
          format: 'XLSX',
        }).expect(403);
        await post(key, '/admin/exports', {
          type: 'BULK_EXPORT',
          academicYearId: yearId,
          periodId,
          format: 'PDF',
        }).expect(403);
        expect(enqueue).not.toHaveBeenCalled();
      },
    );

    it('RF-57..60: el docente de ese curso tampoco puede exportar el suyo (403) y sin sesión es 401', async () => {
      await post('docente01', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csTasks,
        periodId,
        format: 'XLSX',
      }).expect(403);
      await get(null, '/admin/reports/course-sections').expect(401);
      await get(
        null,
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${periodId}`,
      ).expect(401);
      await post(null, '/admin/exports', { type: 'BULK_EXPORT' }).expect(401);
    });

    it('RF-58: un usuario sin permiso no puede ver ni descargar un trabajo del ADMIN', async () => {
      const res = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csTasks,
        periodId,
        format: 'XLSX',
      }).expect(202);
      await get('docente01', `/admin/jobs/${res.body.jobId}`).expect(403);
      await post('docente01', `/admin/jobs/${res.body.jobId}/download-url`, {}).expect(403);
    });
  });

  describe('errores 404 y 422', () => {
    it('RF-60: dashboard con año o período inexistente es 404; período de otro año es 422 PERIOD_MISMATCH', async () => {
      const a = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${NIL}&periodId=${periodId}`,
      ).expect(404);
      expect(a.body.error.code).toBe('YEAR_NOT_FOUND');
      const b = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${NIL}`,
      ).expect(404);
      expect(b.body.error.code).toBe('PERIOD_NOT_FOUND');
      const c = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${emptyYearPeriodId}`,
      ).expect(422);
      expect(c.body.error.code).toBe('PERIOD_MISMATCH');
      await get('admin', '/admin/reports/dashboard?academicYearId=x&periodId=y').expect(400);
    });

    it('RF-58: exportar sección con período de otro año es 422 PERIOD_MISMATCH; inexistentes son 404', async () => {
      const mismatch = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csTasks,
        periodId: emptyYearPeriodId,
        format: 'XLSX',
      }).expect(422);
      expect(mismatch.body.error.code).toBe('PERIOD_MISMATCH');
      const noPeriod = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: csTasks,
        periodId: NIL,
        format: 'XLSX',
      }).expect(404);
      expect(noPeriod.body.error.code).toBe('PERIOD_NOT_FOUND');
      const noCs = await post('admin', '/admin/exports', {
        type: 'SECTION_EXPORT',
        courseSectionId: NIL,
        periodId,
        format: 'XLSX',
      }).expect(404);
      expect(noCs.body.error.code).toBe('COURSE_SECTION_NOT_FOUND');
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('RF-59: ZIP con período de otro año es 422; año sin cursos-sección es 422 NO_COURSE_SECTIONS', async () => {
      const mismatch = await post('admin', '/admin/exports', {
        type: 'BULK_EXPORT',
        academicYearId: yearId,
        periodId: emptyYearPeriodId,
        format: 'PDF',
      }).expect(422);
      expect(mismatch.body.error.code).toBe('PERIOD_MISMATCH');
      const none = await post('admin', '/admin/exports', {
        type: 'BULK_EXPORT',
        academicYearId: emptyYearId,
        periodId: emptyYearPeriodId,
        format: 'PDF',
      }).expect(422);
      expect(none.body.error.code).toBe('NO_COURSE_SECTIONS');
      await post('admin', '/admin/exports', {
        type: 'BULK_EXPORT',
        academicYearId: NIL,
        periodId,
        format: 'PDF',
      }).expect(404);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('RF-58: cuerpo con campos extra, formato en minúscula o ids no UUID es 400', async () => {
      const base = { type: 'SECTION_EXPORT', courseSectionId: csTasks, periodId, format: 'XLSX' };
      await post('admin', '/admin/exports', { ...base, format: 'xlsx' }).expect(400);
      await post('admin', '/admin/exports', { ...base, courseSectionId: '../x' }).expect(400);
      await post('admin', '/admin/exports', { ...base, academicYearId: yearId }).expect(400);
      await post('admin', '/admin/exports', {}).expect(400);
    });
  });

  describe('datos vacíos en archivos reales', () => {
    it('RF-57: el listado muestra el curso sin docente con teacher null', async () => {
      const res = await get(
        'admin',
        `/admin/reports/course-sections?academicYearId=${yearId}`,
      ).expect(200);
      const item = res.body.items.find(
        (i: { courseSectionId: string }) => i.courseSectionId === csNoTeacher,
      );
      expect(item.teacher).toBeNull();
    });

    it('RF-58: curso sin docente y sin estudiantes, XLSX con "Sin docente asignado" y sin filas', async () => {
      const ws = await xlsx(
        await run({
          type: 'SECTION_EXPORT',
          courseSectionId: csNoTeacher,
          periodId,
          format: 'XLSX',
        }),
      );
      expect(ws.getCell('B3').value).toBe('Docente: Sin docente asignado');
      expect(ws.getRow(XLSX_TABLE_ROW + 1).getCell(2).value).toBeNull();
    });

    it('RF-58: período sin tareas, XLSX con estudiantes y "Sin notas"', async () => {
      const ws = await xlsx(
        await run({ type: 'SECTION_EXPORT', courseSectionId: csNoTasks, periodId, format: 'XLSX' }),
      );
      const header = ws.getRow(XLSX_TABLE_ROW);
      expect(header.getCell(3).value).toBe('Promedio');
      const row = ws.getRow(XLSX_TABLE_ROW + 1);
      expect(row.getCell(4).value).toBe('Sin notas');
    });

    it('RF-58: PDF de curso vacío y sin tareas es un PDF', async () => {
      for (const cs of [csNoTeacher, csNoTasks]) {
        const pdf = await run({
          type: 'SECTION_EXPORT',
          courseSectionId: cs,
          periodId,
          format: 'PDF',
        });
        expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      }
    });

    it('RF-58: la tarea que empieza con "=" sale con apóstrofo en el XLSX real', async () => {
      const ws = await xlsx(
        await run({ type: 'SECTION_EXPORT', courseSectionId: csTasks, periodId, format: 'XLSX' }),
      );
      expect(ws.getRow(XLSX_TABLE_ROW).getCell(3).value).toBe("'=Tarea 1");
    });
  });

  describe('RF-60: dashboard coherente', () => {
    it('el total es la suma de las secciones, cuenta los cursos y no trae nombres', async () => {
      const res = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${periodId}`,
      ).expect(200);
      const { total, grades } = res.body;
      expect(total.courseSections).toBe(3);
      expect(grades).toHaveLength(1);
      const sections = grades[0].sections as {
        code: string;
        courseSections: number;
        students: number;
        noGrades: number;
        atRiskEntries: number;
        distribution: Record<string, number>;
        counts: { onTime: number; late: number; ne: number };
      }[];
      expect(sections.map((s) => s.code)).toEqual(['A', 'B']);
      const sum = (f: (s: (typeof sections)[number]) => number) =>
        sections.reduce((n, s) => n + f(s), 0);
      expect(total.courseSections).toBe(sum((s) => s.courseSections));
      expect(total.noGrades).toBe(sum((s) => s.noGrades));
      expect(total.atRiskEntries).toBe(sum((s) => s.atRiskEntries));
      expect(total.counts.ne).toBe(sum((s) => s.counts.ne));
      expect(total.counts.onTime).toBe(sum((s) => s.counts.onTime));
      for (const lit of res.body.literals as string[]) {
        expect(total.distribution[lit]).toBe(sum((s) => s.distribution[lit]));
      }
      // 1.º B no tiene estudiantes; 1.º A tiene 2.
      expect(sections[0].students).toBe(2);
      expect(sections[1].students).toBe(0);
      // Sin nombres ni ids de personas.
      const json = JSON.stringify(res.body);
      for (const key of ['estudiante01', 'estudiante02', 'docente01']) {
        expect(json).not.toContain(names.get(key)!);
        expect(json).not.toContain(ids.get(key)!);
      }
    });
  });
});
