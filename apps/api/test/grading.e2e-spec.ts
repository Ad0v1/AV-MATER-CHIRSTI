import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { AcademicEventPublisher } from './../src/modules/academic/academic-events.js';
import {
  GradingEventPublisher,
  type GradingEvent,
} from './../src/modules/grading/grading-events.js';
import {
  ensureSubmissionVersionTrigger,
  withoutSubmissionVersionTrigger,
} from './db-test-guard.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 4b de Dev 4 (RF-41..52; RN-01..07, RN-10, RN-12, RN-14; U1..U3). MySQL real con el seed
// (solo local). Usa 3A Ciencia y Tecnología (docente03), que no usan los e2e de Dev 3. Tareas,
// archivos y entregas se insertan directo; la limpieza de versiones usa la guarda de DDL.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
process.env.E2E_ALLOW_DDL ??= '1';

const API = '/api/v1';
const TITLE_PREFIX = 'QA-4B ';
const KEY_PREFIX = 'qa-4b/';
const HOUR = 3_600_000;
const REASON = 'Certificado médico presentado por la familia';
const COMMENT = 'Comentario privado de prueba QA-4B';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Calificaciones de Dev 4, fase 4b (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ddl: PrismaClient;
  let sink: MemoryAuditSink;
  let events: GradingEvent[];
  let unsubscribe: () => void = () => undefined;
  let startedAt: Date;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  const enr = new Map<string, string>(); // matrícula vigente en 3A
  let cs3A: string;
  let section3A: string;
  let period4: string;
  let oldEnrollment03: string; // estudiante03 en 3A (cerrada por traslado el 2026-06-15)

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const put = (key: string, assignmentId: string, enrollmentId: string, body: unknown) =>
    http()
      .put(`${API}/grades/${assignmentId}/${enrollmentId}`)
      .set('Cookie', as(key))
      .send(body as object);
  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);

  const makeAssignment = async (dueAt: Date, noSubmissionGrade = '0') =>
    (
      await prisma.assignment.create({
        data: {
          courseSectionId: cs3A,
          periodId: period4,
          title: `${TITLE_PREFIX}Tarea`,
          instructions: 'Subir en PDF',
          dueAt,
          noSubmissionGrade,
          createdById: ids.get('docente03')!,
        },
      })
    ).id;

  /** Entrega directa (archivo CLEAN + Submission + versión 1). */
  const makeSubmission = async (
    assignmentId: string,
    student: string,
    enrollmentId: string,
    isLate = false,
  ) => {
    const file = await prisma.storedFile.create({
      data: {
        objectKey: `${KEY_PREFIX}${randomUUID()}`,
        purpose: 'SUBMISSION',
        courseSectionId: cs3A,
        assignmentId,
        uploadedById: ids.get(student)!,
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
          create: { versionNumber: 1, fileId: file.id, receivedAt: file.completedAt!, isLate },
        },
      },
    });
  };

  const cleanQaData = async () => {
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
  };

  beforeAll(async () => {
    startedAt = new Date();
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    ddl = new PrismaClient({
      adapter: new PrismaMariaDb(process.env.DATABASE_URL!, { useTextProtocol: true }),
    });
    await ensureSubmissionVersionTrigger(ddl);

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    period4 = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, sequence: 4 },
      })
    ).id;
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Ciencia y Tecnología' },
        section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
      },
    });
    cs3A = cs.id;
    section3A = cs.sectionId;

    for (const key of [
      'admin',
      'docente01',
      'docente03',
      'estudiante01',
      'estudiante02',
      'estudiante03',
      'estudiante04',
      'estudiante05',
      'apoderado01',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    for (const key of ['estudiante01', 'estudiante02', 'estudiante04', 'estudiante05']) {
      const e = await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get(key), sectionId: section3A, isCurrent: true },
      });
      enr.set(key, e.id);
    }
    oldEnrollment03 = (
      await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante03'), sectionId: section3A },
      })
    ).id;
    await cleanQaData();

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    events = [];
    unsubscribe = app
      .get(GradingEventPublisher)
      .on('grade.updated.v1', (e) => void events.push(e as GradingEvent));
    const sessions = app.get(SessionService);
    for (const key of ids.keys()) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.get(key) } });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      unsubscribe();
      await prisma.academicPeriod.update({ where: { id: period4 }, data: { closedAt: null } });
      // NE AUTO que el cierre simulado haya creado en tareas ajenas del período 4.
      await prisma.grade.deleteMany({
        where: { source: 'AUTO', createdAt: { gte: startedAt }, assignment: { periodId: period4 } },
      });
      await cleanQaData();
      await ensureSubmissionVersionTrigger(ddl);
    } finally {
      await app?.close();
      await prisma.$disconnect();
      await ddl.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
    events.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Calificar (RF-41, RF-42) y validación', () => {
    it('RF-41: el docente califica una entrega; "05" → "5.00"; bitácora sin comentario; evento', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      const res = await put('docente03', a, enr.get('estudiante01')!, {
        state: 'GRADED',
        value: '05',
        comment: COMMENT,
      }).expect(200);
      expect(res.body).toMatchObject({
        state: 'GRADED',
        value: '5.00',
        comment: COMMENT,
        source: 'MANUAL',
      });
      const [record] = auditOf('grading.grade.create');
      expect(record.afterState).toMatchObject({ state: 'GRADED', value: '5.00', source: 'MANUAL' });
      expect(JSON.stringify(record)).not.toContain(COMMENT);
      expect(events).toEqual([
        expect.objectContaining({
          type: 'grade.updated.v1',
          payload: expect.objectContaining({ gradeStatus: 'GRADED', source: 'MANUAL' }),
        }),
      ]);
      expect(JSON.stringify(events)).not.toContain('5.00');

      const again = await put('docente03', a, enr.get('estudiante01')!, {
        state: 'GRADED',
        value: '18',
      }).expect(200);
      expect(again.body.value).toBe('18.00');
      expect(auditOf('grading.grade.update')[0].beforeState).toEqual({
        state: 'GRADED',
        value: '5.00',
        source: 'MANUAL',
      });
    });

    it('RF-41/RN-01: 400 con nota fuera de rango o cuerpo inválido; 422 NO_SUBMISSION', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await put('docente03', a, enr.get('estudiante02')!, { state: 'GRADED', value: '21' }).expect(
        400,
      );
      await put('docente03', a, enr.get('estudiante02')!, { state: 'X' }).expect(400);
      await put('docente03', a, 'no-uuid', { state: 'GRADED', value: '10' }).expect(400);
      const res = await put('docente03', a, enr.get('estudiante02')!, {
        state: 'GRADED',
        value: '10',
      }).expect(422);
      expect(res.body.error.code).toBe('NO_SUBMISSION');
      await put('docente03', randomUUID(), enr.get('estudiante02')!, {
        state: 'GRADED',
        value: '10',
      }).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('NE manual y automática (RF-44, RF-45, RN-05, U1)', () => {
    it('RF-45: NE manual sin entrega y vencida; 422 HAS_SUBMISSION y NOT_OVERDUE', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR), '2.5');
      const ne = await put('docente03', a, enr.get('estudiante02')!, { state: 'NE' }).expect(200);
      expect(ne.body).toMatchObject({ state: 'NE', value: '2.50', source: 'MANUAL' });

      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      const has = await put('docente03', a, enr.get('estudiante01')!, { state: 'NE' }).expect(422);
      expect(has.body.error.code).toBe('HAS_SUBMISSION');

      const future = await makeAssignment(new Date(Date.now() + 24 * HOUR));
      const early = await put('docente03', future, enr.get('estudiante02')!, {
        state: 'NE',
      }).expect(422);
      expect(early.body.error.code).toBe('NOT_OVERDUE');
    });

    it('RF-44/U1: al leer el docente se guardan las NE AUTO; A3 las resincroniza', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR), '3');
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      const summary = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      const row = (key: string) =>
        summary.body.items.find((i: Json) => i.enrollmentId === enr.get(key));
      expect(row('estudiante02').grade).toMatchObject({
        state: 'NE',
        value: '3.00',
        source: 'AUTO',
        virtual: false,
      });
      expect(row('estudiante01')).toMatchObject({
        grade: { state: null },
        displayStatus: 'SUBMITTED',
      });
      expect(row('estudiante02').displayStatus).toBe('NOT_SUBMITTED');
      const autos = auditOf('grading.grade.auto_ne');
      expect(autos.length).toBeGreaterThan(0);
      expect(autos[0].actorId).toBeUndefined();
      expect(events.some((e) => e.payload.source === 'AUTO')).toBe(true);

      // Segunda lectura: idempotente.
      const count = await prisma.grade.count({ where: { assignmentId: a } });
      await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      expect(await prisma.grade.count({ where: { assignmentId: a } })).toBe(count);

      // A3: cambia la nota NE de la tarea → la NE AUTO se actualiza al leer; la MANUAL no.
      await put('docente03', a, enr.get('estudiante04')!, { state: 'NE', value: '1' }).expect(200);
      await prisma.assignment.update({ where: { id: a }, data: { noSubmissionGrade: '4' } });
      const resync = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      const by = (key: string) =>
        resync.body.items.find((i: Json) => i.enrollmentId === enr.get(key)).grade;
      expect(by('estudiante02')).toMatchObject({ value: '4.00', source: 'AUTO' });
      expect(by('estudiante04')).toMatchObject({ value: '1.00', source: 'MANUAL' });

      // RF-45: el docente reemplaza la NE AUTO por nota tras una entrega tardía.
      await makeSubmission(a, 'estudiante02', enr.get('estudiante02')!, true);
      const late = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      expect(
        late.body.items.find((i: Json) => i.enrollmentId === enr.get('estudiante02')).grade
          .needsRegrade,
      ).toBe(true);
      await put('docente03', a, enr.get('estudiante02')!, {
        state: 'GRADED',
        value: '16',
      }).expect(200);
      const changed = auditOf('grading.grade.update').at(-1)!;
      expect(changed.beforeState).toEqual({ state: 'NE', value: '4.00', source: 'AUTO' });
    });

    it('RF-44: period.closed.v1 deja fijas las NE AUTO del período', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR), '1');
      const closedAt = new Date();
      await prisma.academicPeriod.update({ where: { id: period4 }, data: { closedAt } });
      try {
        app.get(AcademicEventPublisher).publish({
          type: 'period.closed.v1',
          payload: {
            periodId: period4,
            academicYearId: (await prisma.academicPeriod.findUniqueOrThrow({
              where: { id: period4 },
            }))!.academicYearId,
            closedAt: closedAt.toISOString(),
          },
        });
        await vi.waitFor(
          async () => {
            const n = await prisma.grade.count({ where: { assignmentId: a, source: 'AUTO' } });
            expect(n).toBeGreaterThanOrEqual(4);
          },
          { timeout: 10_000, interval: 200 },
        );
      } finally {
        await prisma.academicPeriod.update({ where: { id: period4 }, data: { closedAt: null } });
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('Exonerar (RF-46, RN-07, U2) y período cerrado (RF-50, RN-10)', () => {
    it('RF-46: exonera con motivo; el motivo no va a la bitácora; fuera del promedio', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const res = await put('docente03', a, enr.get('estudiante05')!, {
        state: 'EXEMPT',
        exemptionReason: REASON,
      }).expect(200);
      expect(res.body).toMatchObject({ state: 'EXEMPT', value: null, exemptionReason: REASON });
      expect(JSON.stringify(sink.records)).not.toContain(REASON);
      await put('docente03', a, enr.get('estudiante05')!, {
        state: 'EXEMPT',
        exemptionReason: 'corto',
      }).expect(400);

      const summary = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      const item = summary.body.items.find((i: Json) => i.enrollmentId === enr.get('estudiante05'));
      expect(item.grade).toMatchObject({ state: 'EXEMPT', exemptionReason: REASON });
      expect(item.displayStatus).toBe('EXEMPT');
      expect(summary.body.average.exempt).toBe(1);
    });

    it('RF-50/RN-10: 409 con el período cerrado; el ADMIN tampoco califica', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      await prisma.academicPeriod.update({
        where: { id: period4 },
        data: { closedAt: new Date() },
      });
      try {
        for (const who of ['docente03', 'admin']) {
          await put(who, a, enr.get('estudiante01')!, { state: 'GRADED', value: '12' }).expect(409);
        }
        // La lectura sigue: NE virtual, sin escribir.
        const summary = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
        expect(summary.body.assignment.periodIsOpen).toBe(false);
        const row = summary.body.items.find(
          (i: Json) => i.enrollmentId === enr.get('estudiante02'),
        );
        expect(row.grade).toMatchObject({ state: 'NE', virtual: true });
        expect(await prisma.grade.count({ where: { assignmentId: a } })).toBe(0);
      } finally {
        await prisma.academicPeriod.update({ where: { id: period4 }, data: { closedAt: null } });
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('Permisos (RN-12, docs/05)', () => {
    it('403: docente ajeno, estudiante y apoderado no califican ni leen el registro', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const body = { state: 'NE' };
      for (const who of ['docente01', 'estudiante01', 'apoderado01']) {
        await put(who, a, enr.get('estudiante02')!, body).expect(403);
        await get(who, `/assignments/${a}/grade-summary`).expect(403);
        await get(who, `/course-sections/${cs3A}/gradebook`).expect(403);
      }
      await http()
        .put(`${API}/grades/${a}/${enr.get('estudiante02')}`)
        .send(body)
        .expect(401);
      // El ADMIN sí (modo soporte).
      await put('admin', a, enr.get('estudiante02')!, body).expect(200);
    });

    it('403: apoderado con estudiante no vinculado; estudiante y docente no usan rutas de apoderado', async () => {
      await get('apoderado01', `/guardian/students/${ids.get('estudiante02')}/grades`).expect(403);
      await get('estudiante01', '/guardian/students').expect(403);
      await get('docente03', '/me/grades').expect(403);
      await get('apoderado01', '/me/grades').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Registro auxiliar (RF-47..49)', () => {
    it('RF-47/48/49: matriz, promedios con literal, distribución y riesgo', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      await put('docente03', a, enr.get('estudiante01')!, { state: 'GRADED', value: '19' }).expect(
        200,
      );
      const res = await get(
        'docente03',
        `/course-sections/${cs3A}/gradebook?periodId=${period4}`,
      ).expect(200);
      const book = res.body;
      expect(book.period.id).toBe(period4);
      expect(book.assignments.some((x: Json) => x.id === a)).toBe(true);
      const col = book.assignments.findIndex((x: Json) => x.id === a);
      const s01 = book.students.find((s: Json) => s.enrollmentId === enr.get('estudiante01'));
      expect(s01.cells[col]).toMatchObject({
        state: 'GRADED',
        value: '19.00',
        hasSubmission: true,
      });
      expect(s01.average.status).toBe('OK');
      expect(Object.keys(book.dashboard.distribution)).toEqual(['AD', 'A', 'B', 'C']);
      expect(book.dashboard.riskLiteral).toBe('C');
      expect(Array.isArray(book.dashboard.atRisk)).toBe(true);
      await get('docente03', `/course-sections/${cs3A}/gradebook?periodId=${randomUUID()}`).expect(
        404,
      );
      await get('docente03', `/course-sections/${cs3A}/gradebook?x=1`).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Traslado (RN-14)', () => {
    it('la matrícula cerrada conserva su NE de antes del traslado y no recibe las de después', async () => {
      const before = await makeAssignment(new Date('2026-06-01T15:00:00.000Z'));
      const afterT = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await get('docente03', `/assignments/${before}/grade-summary`).expect(200);
      const summary = await get('docente03', `/assignments/${afterT}/grade-summary`).expect(200);
      expect(summary.body.items.some((i: Json) => i.enrollmentId === oldEnrollment03)).toBe(false);

      const old = await prisma.grade.findUnique({
        where: {
          assignmentId_enrollmentId: { assignmentId: before, enrollmentId: oldEnrollment03 },
        },
      });
      expect(old).toMatchObject({ state: 'NE', source: 'AUTO' });
      const ne = await put('docente03', afterT, oldEnrollment03, { state: 'NE' }).expect(422);
      expect(ne.body.error.code).toBe('ENROLLMENT_NOT_ELIGIBLE');

      const book = await get(
        'docente03',
        `/course-sections/${cs3A}/gradebook?periodId=${period4}`,
      ).expect(200);
      const row = book.body.students.find((s: Json) => s.enrollmentId === oldEnrollment03);
      expect(row).toMatchObject({ isCurrent: false });

      const mine = await get('estudiante03', '/me/grades').expect(200);
      const course = mine.body.courses.find(
        (c: Json) => c.courseSectionId === cs3A && c.enrollmentId === oldEnrollment03,
      );
      expect(course.isCurrent).toBe(false);
      const p4 = course.periods.find((p: Json) => p.id === period4);
      expect(p4.assignments.map((x: Json) => x.assignmentId)).toContain(before);
      expect(p4.assignments.map((x: Json) => x.assignmentId)).not.toContain(afterT);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Mis notas (RF-51) y apoderado (RF-52)', () => {
    it('RF-51: el estudiante ve su nota y comentario, nunca el motivo de exoneración', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await put('docente03', a, enr.get('estudiante05')!, {
        state: 'EXEMPT',
        exemptionReason: REASON,
        comment: 'Visible para el estudiante',
      }).expect(200);
      const res = await get('estudiante05', '/me/grades').expect(200);
      expect(JSON.stringify(res.body)).not.toContain(REASON);
      expect(JSON.stringify(res.body)).not.toContain('exemptionReason');
      const course = res.body.courses.find((c: Json) => c.courseSectionId === cs3A);
      const item = course.periods
        .find((p: Json) => p.id === period4)
        .assignments.find((x: Json) => x.assignmentId === a);
      expect(item).toMatchObject({
        state: 'EXEMPT',
        value: null,
        comment: 'Visible para el estudiante',
        displayStatus: 'EXEMPT',
      });
      // Solo sus matrículas.
      expect(res.body.student.id).toBe(ids.get('estudiante05'));
    });

    it('RF-52: el apoderado ve a sus estudiantes y sus notas, en solo lectura', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      await put('docente03', a, enr.get('estudiante01')!, {
        state: 'GRADED',
        value: '14.5',
      }).expect(200);

      const list = await get('apoderado01', '/guardian/students').expect(200);
      expect(list.body.items.map((s: Json) => s.studentId)).toEqual(
        expect.arrayContaining([ids.get('estudiante01'), await idOf('estudiante11')]),
      );
      expect(list.body.items).toHaveLength(2);
      const grades = await get(
        'apoderado01',
        `/guardian/students/${ids.get('estudiante01')}/grades`,
      ).expect(200);
      const item = grades.body.courses
        .find((c: Json) => c.courseSectionId === cs3A)
        .periods.find((p: Json) => p.id === period4)
        .assignments.find((x: Json) => x.assignmentId === a);
      expect(item).toMatchObject({ state: 'GRADED', value: '14.50' });
      expect(JSON.stringify(grades.body)).not.toContain('exemptionReason');
      await put('apoderado01', a, enr.get('estudiante01')!, {
        state: 'GRADED',
        value: '20',
      }).expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Huecos de QA (RNF-31)', () => {
    it('RN-01: 20.00 se acepta y 20.01 se rechaza (400); "05" → "5.00"', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      await makeSubmission(a, 'estudiante01', enr.get('estudiante01')!);
      const e = enr.get('estudiante01')!;
      await put('docente03', a, e, { state: 'GRADED', value: '20.01' }).expect(400);
      expect(await prisma.grade.count({ where: { assignmentId: a } })).toBe(0);
      const top = await put('docente03', a, e, { state: 'GRADED', value: '20.00' }).expect(200);
      expect(top.body.value).toBe('20.00');
      const low = await put('docente03', a, e, { state: 'GRADED', value: '05' }).expect(200);
      expect(low.body.value).toBe('5.00');
    });

    it('RF-46: motivo de 9 y 501 caracteres → 400; de 10 y 500 → 200', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const e = enr.get('estudiante05')!;
      for (const n of [9, 501]) {
        await put('docente03', a, e, {
          state: 'EXEMPT',
          exemptionReason: 'x'.repeat(n),
        }).expect(400);
      }
      expect(await prisma.grade.count({ where: { assignmentId: a } })).toBe(0);
      await put('docente03', a, e, {
        state: 'EXEMPT',
        exemptionReason: 'x'.repeat(500),
      }).expect(200);
      await put('docente03', a, e, {
        state: 'EXEMPT',
        exemptionReason: 'y'.repeat(10),
      }).expect(200);
    });

    it('RF-45: NE manual con valor propio y sin valor (usa noSubmissionGrade)', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR), '2.5');
      const withValue = await put('docente03', a, enr.get('estudiante02')!, {
        state: 'NE',
        value: '7',
      }).expect(200);
      expect(withValue.body).toMatchObject({ state: 'NE', value: '7.00', source: 'MANUAL' });
      const without = await put('docente03', a, enr.get('estudiante04')!, {
        state: 'NE',
      }).expect(200);
      expect(without.body).toMatchObject({ state: 'NE', value: '2.50', source: 'MANUAL' });
    });

    it('RF-44/A3: la NE AUTO editada pasa a MANUAL y ya no se resincroniza', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR), '3');
      const e = enr.get('estudiante02')!;
      await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      const auto = await prisma.grade.findUniqueOrThrow({
        where: { assignmentId_enrollmentId: { assignmentId: a, enrollmentId: e } },
      });
      expect(auto.source).toBe('AUTO');
      await put('docente03', a, e, { state: 'NE', value: '3' }).expect(200); // mismo valor
      const edited = await prisma.grade.findUniqueOrThrow({ where: { id: auto.id } });
      expect(edited.source).toBe('MANUAL');
      expect(auditOf('grading.grade.update').at(-1)!.beforeState).toEqual({
        state: 'NE',
        value: '3.00',
        source: 'AUTO',
      });

      await prisma.assignment.update({ where: { id: a }, data: { noSubmissionGrade: '9' } });
      const res = await get('docente03', `/assignments/${a}/grade-summary`).expect(200);
      const grade = res.body.items.find((i: Json) => i.enrollmentId === e).grade;
      expect(grade).toMatchObject({ value: '3.00', source: 'MANUAL' });
    });

    it('RF-41: sin cambios no hay bitácora ni evento; sin comment ni exemptionReason en ellos', async () => {
      const a = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const e = enr.get('estudiante05')!;
      const body = { state: 'EXEMPT', exemptionReason: REASON, comment: COMMENT };
      await put('docente03', a, e, body).expect(200);
      expect(auditOf('grading.grade.create')).toHaveLength(1);
      expect(events).toHaveLength(1);
      const first = await prisma.grade.findFirstOrThrow({ where: { assignmentId: a } });

      sink.records.length = 0;
      events.length = 0;
      await put('docente03', a, e, body).expect(200);
      expect(sink.records.filter((r) => r.action.startsWith('grading.'))).toHaveLength(0);
      expect(events).toHaveLength(0);
      const same = await prisma.grade.findFirstOrThrow({ where: { assignmentId: a } });
      expect(same.updatedAt.getTime()).toBe(first.updatedAt.getTime());

      await put('docente03', a, e, { ...body, comment: 'otro comentario QA-4B' }).expect(200);
      expect(auditOf('grading.grade.update')).toHaveLength(1);
      const dump = JSON.stringify([sink.records, events]);
      for (const secret of [REASON, COMMENT, 'otro comentario QA-4B']) {
        expect(dump).not.toContain(secret);
      }
      expect(dump).not.toContain('exemptionReason');
    });

    it('RF-46/RF-48: el exonerado queda fuera del promedio del registro', async () => {
      const g = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const x = await makeAssignment(new Date(Date.now() - 2 * HOUR));
      const e = enr.get('estudiante05')!;
      await makeSubmission(g, 'estudiante05', e);
      await put('docente03', g, e, { state: 'GRADED', value: '10' }).expect(200);
      await put('docente03', x, e, { state: 'EXEMPT', exemptionReason: REASON }).expect(200);
      const res = await get(
        'docente03',
        `/course-sections/${cs3A}/gradebook?periodId=${period4}`,
      ).expect(200);
      const row = res.body.students.find((s: Json) => s.enrollmentId === e);
      const cells: Json[] = row.cells;
      const exempt = cells.filter((c) => c.state === 'EXEMPT').length;
      const counted = cells.filter((c) => c.value !== null && c.value !== undefined).length;
      expect(exempt).toBeGreaterThanOrEqual(1);
      expect(row.average).toMatchObject({ status: 'OK', exempt, counted });
      const sum = cells.reduce((t, c) => t + (c.value != null ? Number(c.value) : 0), 0);
      expect(Number(row.average.rounded)).toBe(Math.round(sum / counted)); // redondeo único al entero
    });

    it('RF-52: el vínculo revocado del apoderado da 403 y desaparece de la lista', async () => {
      const link = await prisma.guardianStudent.findFirstOrThrow({
        where: {
          guardianId: ids.get('apoderado01'),
          studentId: ids.get('estudiante01'),
          isActive: true,
        },
      });
      await prisma.guardianStudent.update({
        where: { id: link.id },
        data: { isActive: null, isPrimary: null, revokedAt: new Date() }, // CHECK: solo un vigente es principal
      });
      try {
        await get('apoderado01', `/guardian/students/${ids.get('estudiante01')}/grades`).expect(
          403,
        );
        const list = await get('apoderado01', '/guardian/students').expect(200);
        expect(list.body.items.map((s: Json) => s.studentId)).not.toContain(
          ids.get('estudiante01'),
        );
      } finally {
        await prisma.guardianStudent.update({
          where: { id: link.id },
          data: { isActive: true, isPrimary: link.isPrimary, revokedAt: null },
        });
      }
      await get('apoderado01', `/guardian/students/${ids.get('estudiante01')}/grades`).expect(200);
    });

    it('RN-14: la elegibilidad de la NE AUTO se mide en dueAt (antes/después del traslado)', async () => {
      const old = await prisma.enrollment.findUniqueOrThrow({
        where: { id: oldEnrollment03 },
        select: { effectiveTo: true },
      });
      const a1 = await makeAssignment(new Date(old.effectiveTo!.getTime() - 24 * HOUR));
      const a2 = await makeAssignment(new Date(old.effectiveTo!.getTime() + 24 * HOUR));
      await get('docente03', `/assignments/${a1}/grade-summary`).expect(200);
      await get('docente03', `/assignments/${a2}/grade-summary`).expect(200);
      const key = (assignmentId: string) => ({
        assignmentId_enrollmentId: { assignmentId, enrollmentId: oldEnrollment03 },
      });
      expect(await prisma.grade.findUnique({ where: key(a1) })).not.toBeNull();
      expect(await prisma.grade.findUnique({ where: key(a2) })).toBeNull();
    });
  });

  const idOf = async (key: string) =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      })
    ).id;
});
