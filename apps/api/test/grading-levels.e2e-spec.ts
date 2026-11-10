import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  ensureSubmissionVersionTrigger,
  withoutSubmissionVersionTrigger,
} from './db-test-guard.js';
import { createDbTestApp } from './helpers.js';

// Tres niveles (09/11/2026, Dev 4): notas literales AD/A/B/C en INICIAL y PRIMARIA y logro del
// bimestre (PeriodAchievement). MySQL real con el seed (solo local). Usa P4C Matemática
// (docente06, estudiante61 con apoderado02) e I5C Matemática (niños sin cuenta; apoderado03 ve
// a inicial01). SECUNDARIA se comprueba con 3A Ciencia y Tecnología (docente03).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
process.env.E2E_ALLOW_DDL ??= '1';

const API = '/api/v1';
const TITLE_PREFIX = 'QA-NIV ';
const KEY_PREFIX = 'qa-niv/';
const HOUR = 3_600_000;
const COMMENT = 'Comentario privado del logro QA-NIV';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Notas literales y logro del bimestre (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ddl: PrismaClient;
  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  let csP4: string;
  let csI5: string;
  let cs3A: string;
  let period4: string;
  let period1: string;
  let enrP4: string; // estudiante61 en P4C
  let enrI5: string; // inicial01 en I5C
  let inicial01: string;
  let enr3A: string; // estudiante01 en 3A

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const putGrade = (key: string, a: string, e: string, body: unknown) =>
    http()
      .put(`${API}/grades/${a}/${e}`)
      .set('Cookie', as(key))
      .send(body as object);
  const putAchievement = (key: string, cs: string, p: string, e: string, body: unknown) =>
    http()
      .put(`${API}/course-sections/${cs}/periods/${p}/achievements/${e}`)
      .set('Cookie', as(key))
      .send(body as object);

  const makeAssignment = async (
    courseSectionId: string,
    teacher: string,
    dueAt: Date,
    noSubmissionLiteral: 'AD' | 'A' | 'B' | 'C' | null = null,
  ) =>
    (
      await prisma.assignment.create({
        data: {
          courseSectionId,
          periodId: period4,
          title: `${TITLE_PREFIX}Tarea`,
          instructions: 'Actividad',
          dueAt,
          noSubmissionLiteral,
          createdById: ids.get(teacher)!,
        },
      })
    ).id;

  const makeSubmission = async (assignmentId: string, cs: string, enrollmentId: string) => {
    const file = await prisma.storedFile.create({
      data: {
        objectKey: `${KEY_PREFIX}${randomUUID()}`,
        purpose: 'SUBMISSION',
        courseSectionId: cs,
        assignmentId,
        uploadedById: ids.get('estudiante61')!,
        originalName: 'Tarea.pdf',
        maxBytes: 20971520,
        intentExpiresAt: new Date(Date.now() + 300_000),
        uploadStatus: 'COMPLETED',
        scanStatus: 'CLEAN',
        sizeBytes: 4096,
        sha256: createHash('sha256').update(randomUUID()).digest('hex'),
        completedAt: new Date(Date.now() - 3 * HOUR),
        scannedAt: new Date(),
      },
    });
    await prisma.submission.create({
      data: {
        assignmentId,
        enrollmentId,
        versions: {
          create: {
            versionNumber: 1,
            fileId: file.id,
            receivedAt: file.completedAt!,
            isLate: false,
          },
        },
      },
    });
  };

  const clean = async () => {
    const assignmentIds = (
      await prisma.assignment.findMany({
        where: { title: { startsWith: TITLE_PREFIX } },
        select: { id: true },
      })
    ).map((a) => a.id);
    await prisma.grade.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    const where = { submission: { assignmentId: { in: assignmentIds } } };
    if ((await prisma.submissionVersion.count({ where })) > 0) {
      await withoutSubmissionVersionTrigger(ddl, () =>
        prisma.submissionVersion.deleteMany({ where }),
      );
    }
    await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.storedFile.deleteMany({ where: { objectKey: { startsWith: KEY_PREFIX } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.periodAchievement.deleteMany({
      where: { courseSectionId: { in: [csP4, csI5].filter(Boolean) } },
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    ddl = new PrismaClient({
      adapter: new PrismaMariaDb(process.env.DATABASE_URL!, { useTextProtocol: true }),
    });
    await ensureSubmissionVersionTrigger(ddl);
    const y = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
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
    const i5 = await cs('INICIAL', 5, 'C', 'Matemática');
    const s3 = await cs('SECUNDARIA', 3, 'A', 'Ciencia y Tecnología');
    csP4 = p4.id;
    csI5 = i5.id;
    cs3A = s3.id;

    for (const key of [
      'admin',
      'docente03',
      'docente06',
      'estudiante01',
      'estudiante61',
      'apoderado01',
      'apoderado02',
      'apoderado03',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    enrP4 = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante61'), sectionId: p4.sectionId, isCurrent: true },
      })
    ).id;
    enr3A = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante01'), sectionId: s3.sectionId, isCurrent: true },
      })
    ).id;
    // inicial01: niño sin cuenta vinculado a apoderado03.
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: ids.get('apoderado03'), isActive: true },
      select: { studentId: true, student: { select: { fullName: true } } },
      orderBy: { student: { fullName: 'asc' } },
    });
    inicial01 = links[0].studentId;
    enrI5 = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: inicial01, sectionId: i5.sectionId, isCurrent: true },
      })
    ).id;
    await clean();

    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const key of ids.keys()) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.get(key) } });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      await clean();
      await ensureSubmissionVersionTrigger(ddl);
    } finally {
      await app?.close();
      await prisma.$disconnect();
      await ddl.$disconnect();
    }
  });

  describe('Notas literales (RN-01, RN-05)', () => {
    it('RN-01: en PRIMARIA se califica con literal y el registro lo muestra sin promedio', async () => {
      const a = await makeAssignment(csP4, 'docente06', new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, csP4, enrP4);
      const res = await putGrade('docente06', a, enrP4, { state: 'GRADED', literal: 'AD' }).expect(
        200,
      );
      expect(res.body).toMatchObject({ state: 'GRADED', value: null, literal: 'AD' });

      const book = (
        await get('docente06', `/course-sections/${csP4}/gradebook?periodId=${period4}`).expect(200)
      ).body as Json;
      expect(book.courseSection.gradingScale).toBe('LITERAL_ADABC');
      expect(book.courseSection.section.level).toBe('PRIMARIA');
      const row = book.students.find((s: Json) => s.enrollmentId === enrP4);
      expect(row.average.status).toBe('LITERAL_SCALE');
      expect(row.cells.find((c: Json) => c.assignmentId === a)).toMatchObject({ literal: 'AD' });
    });

    it('RN-01: 400 si se envía value en PRIMARIA o literal en SECUNDARIA', async () => {
      const a = await makeAssignment(csP4, 'docente06', new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, csP4, enrP4);
      await putGrade('docente06', a, enrP4, { state: 'GRADED', value: '15' }).expect(400);
      await putGrade('docente06', a, enrP4, { state: 'GRADED', literal: 'X' }).expect(400);
      await putGrade('docente06', a, enrP4, { state: 'GRADED', literal: 'A', value: 10 }).expect(
        400,
      );

      const s = await makeAssignment(cs3A, 'docente03', new Date(Date.now() - 2 * HOUR));
      await putGrade('docente03', s, enr3A, { state: 'NE', literal: 'C' }).expect(400);
    });

    it('RN-05: NE literal usa noSubmissionLiteral; sin literal en la tarea queda NE virtual sin literal', async () => {
      const withLit = await makeAssignment(csP4, 'docente06', new Date(Date.now() - 2 * HOUR), 'B');
      const noLit = await makeAssignment(csP4, 'docente06', new Date(Date.now() - 2 * HOUR));
      const book = (
        await get('docente06', `/course-sections/${csP4}/gradebook?periodId=${period4}`).expect(200)
      ).body as Json;
      const row = book.students.find((s: Json) => s.enrollmentId === enrP4);
      expect(row.cells.find((c: Json) => c.assignmentId === withLit)).toMatchObject({
        state: 'NE',
        literal: 'B',
        source: 'AUTO',
      });
      expect(row.cells.find((c: Json) => c.assignmentId === noLit)).toMatchObject({
        state: 'NE',
        literal: null,
        virtual: true,
      });
      const auto = await prisma.grade.findFirstOrThrow({
        where: { assignmentId: withLit, enrollmentId: enrP4 },
      });
      expect(auto).toMatchObject({ state: 'NE', literal: 'B', value: null, source: 'AUTO' });
      expect(await prisma.grade.count({ where: { assignmentId: noLit } })).toBe(0);
      // NE manual sin literal en la tarea: el docente debe indicarlo.
      await putGrade('docente06', noLit, enrP4, { state: 'NE' })
        .expect(422)
        .expect((r) => expect(r.body.error.code).toBe('NE_LITERAL_REQUIRED'));
      await putGrade('docente06', noLit, enrP4, { state: 'NE', literal: 'C' }).expect(200);
    });

    it('RN-05: crear una tarea con literal de NE vale en PRIMARIA y da 400 en SECUNDARIA', async () => {
      const body = {
        periodId: period4,
        title: `${TITLE_PREFIX}API`,
        instructions: 'Actividad',
        dueAt: new Date(Date.now() + 48 * HOUR).toISOString(),
        noSubmissionLiteral: 'C',
      };
      const ok = await http()
        .post(`${API}/course-sections/${csP4}/assignments`)
        .set('Cookie', as('docente06'))
        .send(body)
        .expect(201);
      expect(ok.body.noSubmissionLiteral).toBe('C');
      await http()
        .post(`${API}/course-sections/${cs3A}/assignments`)
        .set('Cookie', as('docente03'))
        .send(body)
        .expect(400);
    });
  });

  describe('Logro del bimestre (PeriodAchievement)', () => {
    it('RN-04: el docente registra el logro; el registro lo usa para la distribución y el riesgo', async () => {
      const res = await putAchievement('docente06', csP4, period4, enrP4, {
        literal: 'C',
        comment: COMMENT,
      }).expect(200);
      expect(res.body).toMatchObject({ literal: 'C', comment: COMMENT, enrollmentId: enrP4 });

      const book = (
        await get('docente06', `/course-sections/${csP4}/gradebook?periodId=${period4}`).expect(200)
      ).body as Json;
      const row = book.students.find((s: Json) => s.enrollmentId === enrP4);
      expect(row.achievement).toMatchObject({ literal: 'C', comment: COMMENT });
      expect(row.atRisk).toBe(true);
      expect(book.dashboard.distribution.C).toBeGreaterThanOrEqual(1);

      // Bitácora sin el comentario (dato de un menor).
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'PeriodAchievement', entityId: res.body.id },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(logs)).not.toContain(COMMENT);

      // Actualizar: mismo registro.
      const upd = await putAchievement('docente06', csP4, period4, enrP4, { literal: 'A' }).expect(
        200,
      );
      expect(upd.body).toMatchObject({ id: res.body.id, literal: 'A', comment: null });
    });

    it('RN-04: "Mis notas" y el apoderado ven el logro', async () => {
      await putAchievement('docente06', csP4, period4, enrP4, {
        literal: 'AD',
        comment: COMMENT,
      }).expect(200);
      const mine = (await get('estudiante61', '/me/grades').expect(200)).body as Json;
      const course = mine.courses.find((c: Json) => c.courseSectionId === csP4);
      expect(course.gradingScale).toBe('LITERAL_ADABC');
      expect(course.periods.find((p: Json) => p.id === period4).achievement).toMatchObject({
        literal: 'AD',
      });

      const g = (
        await get('apoderado02', `/guardian/students/${ids.get('estudiante61')}/grades`).expect(200)
      ).body as Json;
      const gc = g.courses.find((c: Json) => c.courseSectionId === csP4);
      expect(gc.periods.find((p: Json) => p.id === period4).achievement.literal).toBe('AD');
    });

    it('RN-04: en inicial (niño sin cuenta) solo el apoderado vinculado ve el logro', async () => {
      await putAchievement('docente06', csI5, period4, enrI5, { literal: 'A' }).expect(200);
      const list = (await get('apoderado03', '/guardian/students').expect(200)).body as Json;
      expect(list.items.find((i: Json) => i.studentId === inicial01).currentSection.level).toBe(
        'INICIAL',
      );
      const g = (await get('apoderado03', `/guardian/students/${inicial01}/grades`).expect(200))
        .body as Json;
      const gc = g.courses.find((c: Json) => c.courseSectionId === csI5);
      expect(gc.periods.find((p: Json) => p.id === period4).achievement.literal).toBe('A');
      await get('apoderado02', `/guardian/students/${inicial01}/grades`).expect(403);
    });

    it('autorización y reglas: 403, 400 en SECUNDARIA, 409 período cerrado, 422 otra sección, 400 literal inválido', async () => {
      await putAchievement('docente03', csP4, period4, enrP4, { literal: 'A' }).expect(403);
      await putAchievement('estudiante61', csP4, period4, enrP4, { literal: 'A' }).expect(403);
      await putAchievement('apoderado02', csP4, period4, enrP4, { literal: 'A' }).expect(403);
      await putAchievement('docente03', cs3A, period4, enr3A, { literal: 'A' }).expect(400);
      await putAchievement('docente06', csP4, period4, enrP4, { literal: 'D' }).expect(400);
      await putAchievement('docente06', csP4, period4, enrP4, { literal: 'A', extra: 1 }).expect(
        400,
      );
      await putAchievement('docente06', csP4, period4, enrI5, { literal: 'A' }).expect(422);
      const p1 = await prisma.academicPeriod.findUniqueOrThrow({ where: { id: period1 } });
      if (p1.closedAt !== null) {
        await putAchievement('docente06', csP4, period1, enrP4, { literal: 'A' }).expect(409);
      }
      // ADMIN en modo soporte puede escribir.
      await putAchievement('admin', csP4, period4, enrP4, { literal: 'B' }).expect(200);
    });
  });
});
