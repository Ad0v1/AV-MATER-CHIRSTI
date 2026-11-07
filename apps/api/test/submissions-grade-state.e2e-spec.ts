import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { createDbTestApp } from './helpers.js';

// B2 (QA): gradeState real en la lista del docente y en la vista del estudiante, con MySQL real
// (solo local). Las notas se insertan directo (el motor de notas es de Dev 4). Verifica que el
// docente ve los estados GRADED, NE, EXEMPT y el de una entrega sin nota; que el estudiante ve
// el suyo; y que nunca se filtran exemptionReason, comentario ni valor (D-049).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE = 'QA-B2 gradeState';
const SECRET_REASON = 'MOTIVO-SECRETO-EXONERACION';
const SECRET_COMMENT = 'COMENTARIO-SECRETO-DOCENTE';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('gradeState en entregas (e2e, B2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let csId: string;
  let periodId: string;
  let docenteId: string;
  let assignmentId: string;
  let enrollments: { id: string; studentId: string }[] = [];
  const cookies = new Map<string, string>();

  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    request(app.getHttpServer())
      .get(API + url)
      .set('Cookie', as(key));

  const clean = async () => {
    const ids = (
      await prisma.assignment.findMany({ where: { title: TITLE }, select: { id: true } })
    ).map((a) => a.id);
    await prisma.grade.deleteMany({ where: { assignmentId: { in: ids } } });
    await prisma.assignment.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    periodId = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, sequence: 4 },
      })
    ).id;
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Matemática' },
        section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
      },
    });
    csId = cs.id;
    docenteId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'docente01@colegio.example' } })
    ).id;
    enrollments = await prisma.enrollment.findMany({
      where: { sectionId: cs.sectionId, isCurrent: true },
      select: { id: true, studentId: true },
    });
    await clean();

    assignmentId = (
      await prisma.assignment.create({
        data: {
          courseSectionId: csId,
          periodId,
          title: TITLE,
          instructions: 'x',
          dueAt: new Date(Date.now() + 86_400_000),
          allowLate: false,
          createdById: docenteId,
        },
      })
    ).id;

    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const key of ['docente01', 'docente02', 'estudiante01', 'estudiante02', 'apoderado01']) {
      const u = await prisma.user.findUniqueOrThrow({ where: { email: `${key}@colegio.example` } });
      cookies.set(key, await sessions.create({ id: u.id, role: u.role as never }));
    }
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  // Respeta Grade_state_chk: GRADED y NE llevan valor (NE = 0) y sin motivo; EXEMPT sin valor y
  // con motivo. El comentario va siempre, para comprobar que nunca sale en la API.
  const setGrade = (enrollmentId: string, state: 'GRADED' | 'NE' | 'EXEMPT') => {
    const data = {
      state,
      value: state === 'EXEMPT' ? null : state === 'NE' ? '0.00' : '15.00',
      comment: SECRET_COMMENT,
      exemptionReason: state === 'EXEMPT' ? SECRET_REASON : null,
      gradedAt: new Date(),
    };
    return prisma.grade.upsert({
      where: { assignmentId_enrollmentId: { assignmentId, enrollmentId } },
      create: { assignmentId, enrollmentId, ...data },
      update: data,
    });
  };

  it('B2: el docente ve GRADED, NE, EXEMPT y PENDING en una sola lista, sin datos de la nota', async () => {
    expect(enrollments.length).toBeGreaterThanOrEqual(4);
    const [eGraded, eNe, eExempt, ...rest] = enrollments;
    await setGrade(eGraded.id, 'GRADED');
    await setGrade(eNe.id, 'NE');
    await setGrade(eExempt.id, 'EXEMPT');

    const res = await get('docente01', `/assignments/${assignmentId}/submissions`).expect(200);
    const by = new Map<string, Json>(res.body.items.map((i: Json) => [i.enrollmentId, i]));
    expect(by.get(eGraded.id)?.displayStatus).toBe('GRADED');
    expect(by.get(eNe.id)?.displayStatus).toBe('NOT_SUBMITTED');
    expect(by.get(eExempt.id)?.displayStatus).toBe('EXEMPT');
    expect(by.get(rest[0].id)?.displayStatus).toBe('PENDING');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(SECRET_REASON);
    expect(body).not.toContain(SECRET_COMMENT);
    expect(body).not.toMatch(/exemptionReason|"comment"|"value"|"gradedAt"/);
  });

  it('B2: el estudiante ve solo su estado en cada transicion y nunca la razon ni el comentario', async () => {
    const u1 = await prisma.user.findUniqueOrThrow({
      where: { email: 'estudiante01@colegio.example' },
    });
    const own = enrollments.find((e) => e.studentId === u1.id)!;
    expect(own).toBeDefined();
    for (const [state, expected] of [
      ['GRADED', 'GRADED'],
      ['NE', 'NOT_SUBMITTED'],
      ['EXEMPT', 'EXEMPT'],
    ] as const) {
      await setGrade(own.id, state);
      const res = await get('estudiante01', `/assignments/${assignmentId}/submissions/me`).expect(
        200,
      );
      expect(res.body.displayStatus).toBe(expected);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(SECRET_REASON);
      expect(body).not.toContain(SECRET_COMMENT);
      expect(body).not.toMatch(/exemptionReason|"comment"|"value"/);
    }
  });

  it('B2: permisos intactos: docente ajeno 403, apoderado 403, sin sesion 401', async () => {
    await get('docente02', `/assignments/${assignmentId}/submissions`).expect(403);
    await get('apoderado01', `/assignments/${assignmentId}/submissions`).expect(403);
    await get('apoderado01', `/assignments/${assignmentId}/submissions/me`).expect(403);
    await request(app.getHttpServer())
      .get(`${API}/assignments/${assignmentId}/submissions`)
      .expect(401);
  });
});
