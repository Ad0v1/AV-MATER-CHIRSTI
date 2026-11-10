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
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  JobResultStorage,
  type TrackedJobData,
  TrackedJobRunner,
} from './../src/modules/jobs/index.js';
import { buildPersonalData } from './../src/modules/lifecycle/processors/personal-data-export.processor.js';
import { QueueService } from './../src/modules/queue/index.js';
import type { PdfRenderer } from './../src/modules/reports/gotenberg.client.js';
import { SectionExportProcessor } from './../src/modules/reports/processors/section-export.processor.js';
import { ReportRendererService } from './../src/modules/reports/report-renderer.service.js';
import { XLSX_SHEET, XLSX_TABLE_ROW } from './../src/modules/reports/report-xlsx.js';
import { ReportsDataService } from './../src/modules/reports/reports-data.service.js';
import { InstitutionLogoStorage } from './../src/modules/settings/institution-logo.storage.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp } from './helpers.js';

// Tres niveles (09/11/2026, QA): reportes de escala literal con logros reales en la BD (XLSX, HTML
// del PDF, dashboard), exportación de datos personales v2 (logrosDelPeriodo) y casos límite del
// logro: traslado, período cerrado, ADMIN en soporte y aislamiento entre docentes de distinto
// nivel. MySQL y MinIO reales con el seed (solo local con Docker). Usa P4C Matemática (docente06,
// estudiante61 y siguientes) e I5C Matemática; SECUNDARIA con 3A Ciencia y Tecnología (docente03).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const PREFIX = 'QA-LVR ';
const QA_EMAIL = 'qa-lvr-traslado@colegio.example';
const COMMENT = 'Comentario del logro QA-LVR';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fakeJob = (backgroundJobId: string) =>
  ({ data: { backgroundJobId }, opts: { attempts: 1 }, attemptsMade: 0 }) as Job<TrackedJobData>;

describe.skipIf(!process.env.DATABASE_URL)('Tres niveles: reportes y logros (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let processor: SectionExportProcessor;
  let html = '';

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  let yearId: string;
  let period1: string;
  let period4: string;
  let csP4: string;
  let csI5: string;
  let cs3A: string;
  let secP4: string;
  let enrP4a: string; // estudiante61
  let enrP4b: string; // estudiante62
  let studentA: string;
  let studentB: string;
  let courseSectionsOfP4C = 0;
  let enrolledP4C = 0;

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const post = (key: string, url: string, body: object) =>
    http()
      .post(API + url)
      .set('Cookie', as(key))
      .send(body);
  const putAchievement = (key: string, cs: string, p: string, e: string, body: object) =>
    http()
      .put(`${API}/course-sections/${cs}/periods/${p}/achievements/${e}`)
      .set('Cookie', as(key))
      .send(body);
  const download = async (jobId: string) => {
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(row.status).toBe('SUCCEEDED');
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: row.resultObjectKey! }));
    return Buffer.from(await res.Body!.transformToByteArray());
  };
  const exportSection = async (cs: string, period: string, format: 'XLSX' | 'PDF') => {
    const res = await post('admin', '/admin/exports', {
      type: 'SECTION_EXPORT',
      courseSectionId: cs,
      periodId: period,
      format,
    }).expect(202);
    await processor.handle(fakeJob(res.body.jobId));
    return { jobId: res.body.jobId as string, file: await download(res.body.jobId) };
  };

  const cleanJobs = async () => {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        type: 'SECTION_EXPORT',
        requestedById: ids.get('admin') ?? '-',
        academicYearId: yearId ?? '-',
      },
      select: { id: true, resultObjectKey: true },
    });
    const results = app.get(JobResultStorage, { strict: false });
    for (const r of rows) {
      if (r.resultObjectKey) await results.delete(r.resultObjectKey).catch(() => undefined);
    }
    await prisma.backgroundJob.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  };

  const clean = async () => {
    const section = secP4
      ? await prisma.section.findFirst({
          where: { academicYearId: yearId, level: 'PRIMARIA', gradeLevel: 4, code: 'Q' },
        })
      : null;
    const qa = await prisma.user.findUnique({ where: { email: QA_EMAIL } });
    if (qa) {
      await prisma.periodAchievement.deleteMany({ where: { enrollment: { studentId: qa.id } } });
      await prisma.enrollment.deleteMany({ where: { studentId: qa.id } });
    }
    if (section) {
      await prisma.courseSection.deleteMany({ where: { sectionId: section.id } });
      await prisma.section.delete({ where: { id: section.id } });
    }
    if (qa) await prisma.user.delete({ where: { id: qa.id } });
    await prisma.grade.deleteMany({ where: { assignment: { title: { startsWith: PREFIX } } } });
    await prisma.assignment.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await prisma.periodAchievement.deleteMany({
      where: { courseSection: { section: { id: { in: [secP4].filter(Boolean) } } } },
    });
    await prisma.periodAchievement.deleteMany({
      where: { courseSectionId: { in: [csI5].filter(Boolean) } },
    });
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

    const y = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    yearId = y.id;
    const periods = await prisma.academicPeriod.findMany({
      where: { academicYearId: y.id },
      orderBy: { sequence: 'asc' },
    });
    period1 = periods[0].id;
    period4 = periods[3].id;
    const cs = (
      level: 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA',
      gradeLevel: number,
      code: string,
      course: string,
    ) =>
      prisma.courseSection.findFirstOrThrow({
        where: {
          course: { name: course },
          section: { academicYearId: y.id, level, gradeLevel, code },
        },
      });
    const p4 = await cs('PRIMARIA', 4, 'C', 'Matemática');
    csP4 = p4.id;
    secP4 = p4.sectionId;
    csI5 = (await cs('INICIAL', 5, 'C', 'Matemática')).id;
    cs3A = (await cs('SECUNDARIA', 3, 'A', 'Ciencia y Tecnología')).id;
    courseSectionsOfP4C = await prisma.courseSection.count({ where: { sectionId: secP4 } });
    enrolledP4C = await prisma.enrollment.count({ where: { sectionId: secP4, isCurrent: true } });

    for (const key of ['admin', 'docente03', 'docente06', 'estudiante61', 'estudiante62']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    studentA = ids.get('estudiante61')!;
    studentB = ids.get('estudiante62')!;
    enrP4a = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: studentA, sectionId: secP4, isCurrent: true },
      })
    ).id;
    enrP4b = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: studentB, sectionId: secP4, isCurrent: true },
      })
    ).id;

    app = await createDbTestApp();
    vi.spyOn(app.get(QueueService, { strict: false }), 'enqueue').mockImplementation(
      (_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''),
    );
    vi.spyOn(app.get(ThrottlerStorage, { strict: false }), 'increment').mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const pdfRenderer: PdfRenderer = {
      htmlToPdf: (h) => {
        html = h;
        return Promise.resolve(Buffer.from('%PDF-1.4 falso'));
      },
    };
    const results = app.get(JobResultStorage, { strict: false });
    const runner = app.get(TrackedJobRunner, { strict: false });
    const renderer = new ReportRendererService(
      app.get(PrismaService, { strict: false }),
      app.get(ReportsDataService, { strict: false }),
      app.get(InstitutionLogoStorage, { strict: false }),
      pdfRenderer,
    );
    processor = new SectionExportProcessor(null as never, runner, renderer, results);

    const sessions = app.get(SessionService);
    for (const key of ids.keys()) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.get(key) } });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
    await clean();
    await cleanJobs();
    // Estado de partida: sin logros en P4C ni en I5C.
    await prisma.periodAchievement.deleteMany({
      where: { courseSection: { sectionId: { in: [secP4] } } },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && app) {
        await cleanJobs();
        await clean();
        await prisma.periodAchievement.deleteMany({
          where: { courseSection: { sectionId: { in: [secP4] } } },
        });
      }
    } finally {
      await prisma?.$disconnect();
      await app?.close();
    }
  });

  describe('RF-58: reporte de escala literal con logros reales', () => {
    beforeAll(async () => {
      await putAchievement('docente06', csP4, period4, enrP4a, { literal: 'B' }).expect(200);
      await putAchievement('docente06', csP4, period4, enrP4b, {
        literal: 'C',
        comment: COMMENT,
      }).expect(200);
    });

    it('RF-58: XLSX de PRIMARIA tiene columna Logro (sin Promedio), la letra elegida y "Sin logro"', async () => {
      const { file } = await exportSection(csP4, period4, 'XLSX');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
      const ws = wb.getWorksheet(XLSX_SHEET)!;
      expect(ws.getCell('B4').value).toBe(`Sección: 4.° Primaria C (2026)`);
      const header = ws.getRow(XLSX_TABLE_ROW);
      const titles: string[] = [];
      header.eachCell((c) => titles.push(c.text));
      expect(titles.slice(-2)).toEqual(['Logro', 'En riesgo']);
      expect(titles).not.toContain('Promedio');
      expect(titles).not.toContain('Literal');
      const logroCol = titles.indexOf('Logro') + 1;
      const riesgoCol = titles.indexOf('En riesgo') + 1;

      const rowOf = async (studentId: string) => {
        const name = (await prisma.user.findUniqueOrThrow({ where: { id: studentId } })).fullName;
        for (let r = XLSX_TABLE_ROW + 1; r <= XLSX_TABLE_ROW + enrolledP4C; r++) {
          if (ws.getRow(r).getCell(2).value === name) return ws.getRow(r);
        }
        throw new Error(`Sin fila para ${name}`);
      };
      const a = await rowOf(studentA);
      expect(a.getCell(logroCol).value).toBe('B');
      expect(a.getCell(riesgoCol).value).toBe('No');
      const b = await rowOf(studentB);
      expect(b.getCell(logroCol).value).toBe('C');
      expect(b.getCell(riesgoCol).value).toBe('Sí');
      const sin = await rowOf(await otherStudent());
      expect(sin.getCell(logroCol).value).toBe('Sin logro');
      // El comentario del logro (dato de un menor) no sale en el reporte.
      expect(JSON.stringify(ws.getSheetValues())).not.toContain(COMMENT);
      expect(
        JSON.stringify(ws.getSheetValues()).includes('Escala literal AD/A/B/C sin promedio'),
      ).toBe(true);
    });

    const otherStudent = async () =>
      (
        await prisma.enrollment.findFirstOrThrow({
          where: {
            sectionId: secP4,
            isCurrent: true,
            studentId: { notIn: [studentA, studentB] },
          },
        })
      ).studentId;

    it('RF-58: el PDF de PRIMARIA (HTML enviado al renderizador) lleva Logro y sin Promedio', async () => {
      html = '';
      await exportSection(csP4, period4, 'PDF');
      expect(html).toContain('Logro');
      expect(html).toContain('Sin logro');
      expect(html).not.toContain('Promedio');
      expect(html).not.toContain(COMMENT);
    });

    it('RF-58: SECUNDARIA conserva Promedio y Literal y no tiene Logro', async () => {
      const { file } = await exportSection(cs3A, period4, 'XLSX');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
      const titles: string[] = [];
      wb.getWorksheet(XLSX_SHEET)!
        .getRow(XLSX_TABLE_ROW)
        .eachCell((c) => titles.push(c.text));
      expect(titles.slice(-3)).toEqual(['Promedio', 'Literal', 'En riesgo']);
      expect(titles).not.toContain('Logro');
    });

    it('RF-60: el dashboard cuenta los logros en achievements, no en distribution, y separa totalByScale', async () => {
      const res = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${period4}&level=PRIMARIA&gradeLevel=4`,
      ).expect(200);
      expect(res.body.achievementLiterals).toEqual(['AD', 'A', 'B', 'C']);
      expect(res.body.achievementRiskLiteral).toBe('C');
      expect(res.body.riskLiteral).toBeNull();
      expect(res.body.totalByScale.NUMERIC_0_20).toBeNull();
      const lit = res.body.totalByScale.LITERAL_ADABC;
      expect(lit.gradingScale).toBe('LITERAL_ADABC');
      expect(lit.average.status).toBe('LITERAL_SCALE');
      const [grade] = res.body.grades;
      expect(grade).toMatchObject({ level: 'PRIMARIA', gradeLevel: 4, label: '4.° Primaria' });
      const c = grade.sections.find((s: Json) => s.code === 'C');
      expect(c.gradingScale).toBe('LITERAL_ADABC');
      expect(c.achievements).toEqual({ AD: 0, A: 0, B: 1, C: 1 });
      expect(Object.values(c.distribution).every((n) => n === 0)).toBe(true);
      expect(c.noGrades).toBe(courseSectionsOfP4C * enrolledP4C - 2);
      expect(c.atRiskEntries).toBeGreaterThanOrEqual(1);
      expect(c.atRiskStudents).toBeGreaterThanOrEqual(1);
      expect(lit.achievements).toEqual(c.achievements);
      expect(JSON.stringify(res.body)).not.toContain(studentB);
      expect(JSON.stringify(res.body)).not.toContain(COMMENT);
    });

    it('RF-60: sin filtro de nivel el total es MIXED y trae las dos escalas', async () => {
      const res = await get(
        'admin',
        `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${period4}`,
      ).expect(200);
      expect(res.body.total.gradingScale).toBe('MIXED');
      expect(res.body.totalByScale.NUMERIC_0_20).not.toBeNull();
      expect(res.body.totalByScale.LITERAL_ADABC.achievements.B).toBeGreaterThanOrEqual(1);
      expect(res.body.totalByScale.NUMERIC_0_20.achievements).toEqual({
        AD: 0,
        A: 0,
        B: 0,
        C: 0,
      });
      const levels = res.body.grades.map((g: Json) => g.level);
      expect(levels).toEqual([...levels].sort((x, y) => order(x) - order(y)));
    });

    const order = (l: string) => ['INICIAL', 'PRIMARIA', 'SECUNDARIA'].indexOf(l);

    it('RF-60: el grado debe existir en el nivel (SECUNDARIA 6 es 400) y exige nivel', async () => {
      const base = `/admin/reports/dashboard?academicYearId=${yearId}&periodId=${period4}`;
      await get('admin', `${base}&level=SECUNDARIA&gradeLevel=6`).expect(400);
      await get('admin', `${base}&gradeLevel=4`).expect(400);
      await get('docente06', base).expect(403);
    });
  });

  describe('RF-63: exportación de datos personales v2', () => {
    it('RF-63: incluye literal en notas, logrosDelPeriodo y nivel, solo del estudiante pedido', async () => {
      await putAchievement('docente06', csP4, period4, enrP4a, {
        literal: 'AD',
        comment: COMMENT,
      }).expect(200);
      await putAchievement('docente06', csP4, period4, enrP4b, { literal: 'A' }).expect(200);
      const assignment = await prisma.assignment.create({
        data: {
          courseSectionId: csP4,
          periodId: period4,
          title: `${PREFIX}Tarea literal`,
          instructions: 'Actividad',
          dueAt: new Date(Date.now() - 86_400_000),
          createdById: ids.get('docente06')!,
        },
      });
      await prisma.grade.create({
        data: {
          assignmentId: assignment.id,
          enrollmentId: enrP4a,
          state: 'GRADED',
          literal: 'A',
          comment: 'Buen trabajo',
          gradedAt: new Date(),
        },
      });

      const data = await buildPersonalData(
        app.get(PrismaService, { strict: false }),
        studentA,
        new Date(),
      );
      expect(data).not.toBeNull();
      expect(data!.formato).toBe(2);
      expect(data!.matriculas.find((m) => m.vigente)).toMatchObject({
        anio: 2026,
        nivel: 'PRIMARIA',
        grado: 4,
        seccion: 'C',
      });
      const nota = data!.notas.find((n) => n.tarea === `${PREFIX}Tarea literal`);
      expect(nota).toMatchObject({ estado: 'GRADED', valor: null, literal: 'A' });
      expect(data!.logrosDelPeriodo).toHaveLength(1);
      expect(data!.logrosDelPeriodo[0]).toMatchObject({
        curso: 'Matemática',
        literal: 'AD',
        comentario: COMMENT,
      });
      expect(data!.logrosDelPeriodo[0].periodo).toEqual(expect.any(String));
      // Sin datos de otro estudiante.
      const json = JSON.stringify(data);
      expect(json).not.toContain(studentB);
      expect(json).not.toContain(enrP4b);

      const b = await buildPersonalData(
        app.get(PrismaService, { strict: false }),
        studentB,
        new Date(),
      );
      expect(b!.logrosDelPeriodo.map((l) => l.literal)).toEqual(['A']);
      expect(b!.logrosDelPeriodo[0].comentario).toBeNull();
      expect(b!.notas.filter((n) => n.tarea.startsWith(PREFIX))).toHaveLength(0);
    });
  });

  describe('Casos límite del logro (RN-04, RN-10, RN-14)', () => {
    it('RN-14: traslado con logro, el logro queda en la matrícula cerrada y la nueva empieza sin logro', async () => {
      const section = await prisma.section.create({
        data: { academicYearId: yearId, level: 'PRIMARIA', gradeLevel: 4, code: 'Q' },
      });
      const course = await prisma.courseSection.findUniqueOrThrow({ where: { id: csP4 } });
      const csQ = await prisma.courseSection.create({
        data: {
          sectionId: section.id,
          courseId: course.courseId,
          teacherId: ids.get('docente06'),
        },
      });
      const qa = await prisma.user.create({
        data: { email: QA_EMAIL, fullName: 'Ficticio QA-LVR traslado', role: 'STUDENT' },
      });
      const old = await prisma.enrollment.create({
        data: {
          studentId: qa.id,
          sectionId: secP4,
          academicYearId: yearId,
          effectiveFrom: new Date(Date.now() - 20 * 86_400_000),
        },
      });
      await putAchievement('docente06', csP4, period4, old.id, { literal: 'C' }).expect(200);

      const res = await post('admin', `/students/${qa.id}/transfer`, {
        sectionId: section.id,
        reason: 'QA-LVR',
      }).expect(200);
      const current = res.body.current.id as string;
      expect(res.body.closed).toMatchObject({ id: old.id, endReason: 'TRANSFER' });

      // El logro sigue en la matrícula cerrada.
      expect(await prisma.periodAchievement.count({ where: { enrollmentId: old.id } })).toBe(1);
      const oldBook = (
        await get('docente06', `/course-sections/${csP4}/gradebook?periodId=${period4}`).expect(200)
      ).body as Json;
      const oldRow = oldBook.students.find((s: Json) => s.enrollmentId === old.id);
      expect(oldRow).toBeDefined();
      expect(oldRow.achievement).toMatchObject({ literal: 'C' });

      // La matrícula nueva no hereda el logro.
      const newBook = (
        await get('docente06', `/course-sections/${csQ.id}/gradebook?periodId=${period4}`).expect(
          200,
        )
      ).body as Json;
      const newRow = newBook.students.find((s: Json) => s.enrollmentId === current);
      expect(newRow.achievement).toBeNull();
      expect(await prisma.periodAchievement.count({ where: { enrollmentId: current } })).toBe(0);

      // Cada logro solo vale en la sección de su matrícula (422 en la otra).
      await putAchievement('docente06', csQ.id, period4, old.id, { literal: 'A' }).expect(422);
      await putAchievement('docente06', csP4, period4, current, { literal: 'A' }).expect(422);
      await putAchievement('docente06', csQ.id, period4, current, { literal: 'A' }).expect(200);
      expect(await prisma.periodAchievement.count({ where: { enrollmentId: old.id } })).toBe(1);

      // El estudiante trasladado ve el logro de la matrícula vigente, no el de la cerrada.
      await prisma.periodAchievement.deleteMany({ where: { enrollment: { studentId: qa.id } } });
    });

    it('RN-10: con el período cerrado el logro da 409 también para el ADMIN y no se escribe nada', async () => {
      const before = await prisma.academicPeriod.findUniqueOrThrow({ where: { id: period1 } });
      const closedAt = before.closedAt ?? new Date();
      if (before.closedAt === null) {
        await prisma.academicPeriod.update({ where: { id: period1 }, data: { closedAt } });
      }
      try {
        for (const key of ['docente06', 'admin']) {
          const res = await putAchievement(key, csP4, period1, enrP4a, { literal: 'A' }).expect(
            409,
          );
          expect(JSON.stringify(res.body)).toMatch(/cerrado/i);
        }
        expect(
          await prisma.periodAchievement.count({
            where: { enrollmentId: enrP4a, periodId: period1 },
          }),
        ).toBe(0);
      } finally {
        if (before.closedAt === null) {
          await prisma.academicPeriod.update({ where: { id: period1 }, data: { closedAt: null } });
        }
      }
    });

    it('RN-04: ADMIN en modo soporte escribe el logro en PRIMARIA e INICIAL; en SECUNDARIA da 400', async () => {
      await putAchievement('admin', csP4, period4, enrP4a, { literal: 'B' }).expect(200);
      const enrI5 = (
        await prisma.enrollment.findFirstOrThrow({
          where: { section: { courseSections: { some: { id: csI5 } } }, isCurrent: true },
        })
      ).id;
      await putAchievement('admin', csI5, period4, enrI5, { literal: 'A' }).expect(200);
      const enr3A = (
        await prisma.enrollment.findFirstOrThrow({
          where: { section: { courseSections: { some: { id: cs3A } } }, isCurrent: true },
        })
      ).id;
      await putAchievement('admin', cs3A, period4, enr3A, { literal: 'A' }).expect(400);
      // La bitácora registra al ADMIN como actor y no guarda el comentario.
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'PeriodAchievement', actorId: ids.get('admin') },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(logs)).not.toContain(COMMENT);
    });

    it('RN-04: un docente de secundaria no escribe logros ni notas en secciones de primaria o inicial ajenas', async () => {
      await putAchievement('docente03', csP4, period4, enrP4a, { literal: 'AD' }).expect(403);
      const enrI5 = (
        await prisma.enrollment.findFirstOrThrow({
          where: { section: { courseSections: { some: { id: csI5 } } }, isCurrent: true },
        })
      ).id;
      await putAchievement('docente03', csI5, period4, enrI5, { literal: 'AD' }).expect(403);
      // Tampoco la nota literal ni ver el registro ajeno.
      const a = await prisma.assignment.create({
        data: {
          courseSectionId: csP4,
          periodId: period4,
          title: `${PREFIX}Ajena`,
          instructions: 'Actividad',
          dueAt: new Date(Date.now() - 86_400_000),
          createdById: ids.get('docente06')!,
        },
      });
      await http()
        .put(`${API}/grades/${a.id}/${enrP4a}`)
        .set('Cookie', as('docente03'))
        .send({ state: 'GRADED', literal: 'AD' })
        .expect(403);
      await get('docente03', `/course-sections/${csP4}/gradebook?periodId=${period4}`).expect(403);
      expect(
        await prisma.grade.count({ where: { assignmentId: a.id, enrollmentId: enrP4a } }),
      ).toBe(0);
      // Y el docente de primaria tampoco entra a secundaria.
      const enr3A = (
        await prisma.enrollment.findFirstOrThrow({
          where: { section: { courseSections: { some: { id: cs3A } } }, isCurrent: true },
        })
      ).id;
      await putAchievement('docente06', cs3A, period4, enr3A, { literal: 'A' }).expect(403);
    });
  });
});
