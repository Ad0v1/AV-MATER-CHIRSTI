import { randomUUID } from 'node:crypto';
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
import { createTestApp, MemoryAuditSink } from './helpers.js';

// RF-15 (F6, entrega 6a): clonar la estructura de un año en otro. Usa MySQL real con el seed
// cargado (solo local con Docker) y deja la BD como estaba: borra sus años, cursos y usuarios QA.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const COURSE_PREFIX = 'QA-F6C ';
const USER_PREFIX = 'qa-f6c-';
// 2018/2019: anteriores al año activo (solo lectura, D-030). 2080..2085: años futuros editables.
const QA_YEARS = [2018, 2019, 2080, 2081, 2082, 2083, 2084, 2085];

const periodsOf = (year: number) => [
  { sequence: 1, startDate: `${year}-03-01`, endDate: `${year}-05-31` },
  { sequence: 2, startDate: `${year}-06-01`, endDate: `${year}-08-31` },
  { sequence: 3, startDate: `${year}-09-01`, endDate: `${year}-11-30` },
  { sequence: 4, startDate: `${year}-12-01`, endDate: `${year}-12-20` },
];

describe.skipIf(!process.env.DATABASE_URL)('Clonar estructura RF-15 (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let sink: MemoryAuditSink;
  let baseline: Record<string, number>;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  const years = new Map<number, string>();

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const clone = (key: string, targetId: string, body: object) =>
    http()
      .post(`${API}/academic-years/${targetId}/clone-structure`)
      .set('Cookie', as(key))
      .send(body);
  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);

  const counts = async () => ({
    years: await prisma.academicYear.count(),
    periods: await prisma.academicPeriod.count(),
    sections: await prisma.section.count(),
    courses: await prisma.course.count(),
    courseSections: await prisma.courseSection.count(),
    enrollments: await prisma.enrollment.count(),
    users: await prisma.user.count(),
  });

  const cleanQaData = async () => {
    const qaYears = await prisma.academicYear.findMany({
      where: { year: { in: QA_YEARS } },
      select: { id: true },
    });
    const yearIds = qaYears.map((y) => y.id);
    await prisma.courseSection.deleteMany({
      where: { section: { academicYearId: { in: yearIds } } },
    });
    await prisma.courseSection.deleteMany({
      where: { course: { name: { startsWith: COURSE_PREFIX } } },
    });
    await prisma.section.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.course.deleteMany({ where: { name: { startsWith: COURSE_PREFIX } } });
    await prisma.user.deleteMany({
      where: { institutionalEmail: { startsWith: USER_PREFIX } },
    });
  };

  const createYear = async (year: number): Promise<string> => {
    const res = await http()
      .post(`${API}/academic-years`)
      .set('Cookie', as('admin'))
      .send({ year, periods: periodsOf(year) })
      .expect(201);
    years.set(year, res.body.id as string);
    return res.body.id as string;
  };

  const sectionsOf = (yearId: string) =>
    prisma.section.findMany({
      where: { academicYearId: yearId },
      include: { courseSections: true },
      orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
    });

  let year2025Id: string;
  let year2026Id: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await cleanQaData(); // por si una corrida anterior se interrumpió
    baseline = await counts();

    year2025Id = (await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } })).id;
    year2026Id = (await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } })).id;

    app = await createTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    const sessions = app.get(SessionService);

    for (const key of ['admin', 'docente01', 'docente02', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role }));
    }
    // Usuarios QA: un ADMIN inactivo (ActiveActorGuard) y un docente inactivo (copyTeachers).
    const inactiveAdmin = await prisma.user.create({
      data: {
        institutionalEmail: `${USER_PREFIX}admin@colegio.example`,
        fullName: 'QA Admin Inactivo',
        role: 'ADMIN',
        status: 'INACTIVE',
      },
    });
    cookies.set('adminInactivo', await sessions.create({ id: inactiveAdmin.id, role: 'ADMIN' }));
    const inactiveTeacher = await prisma.user.create({
      data: {
        institutionalEmail: `${USER_PREFIX}docente@colegio.example`,
        fullName: 'QA Docente Inactivo',
        role: 'TEACHER',
        status: 'INACTIVE',
      },
    });
    ids.set('docenteInactivo', inactiveTeacher.id);

    for (const y of [2018, 2019, 2080, 2081, 2082, 2083, 2084, 2085]) await createYear(y);
  });

  afterAll(async () => {
    try {
      await cleanQaData();
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Acceso y validación', () => {
    it('RF-15: 401 sin sesión', async () => {
      await http()
        .post(`${API}/academic-years/${randomUUID()}/clone-structure`)
        .send({ sourceYearId: randomUUID() })
        .expect(401);
    });

    it('RF-15: 403 a docente, estudiante y apoderado; 403 a un ADMIN inactivo', async () => {
      const body = { sourceYearId: year2026Id };
      for (const key of ['docente01', 'estudiante01', 'apoderado01', 'adminInactivo']) {
        const res = await clone(key, years.get(2080)!, body);
        expect(res.status, key).toBe(403);
      }
      expect(await prisma.section.count({ where: { academicYearId: years.get(2080)! } })).toBe(0);
    });

    it('RF-15: cuerpo inválido 400 (campo de más, id no UUID, copyTeachers no booleano)', async () => {
      const target = years.get(2080)!;
      for (const body of [
        { sourceYearId: year2026Id, extra: 1 },
        { sourceYearId: 'no-es-uuid' },
        { sourceYearId: year2026Id, copyTeachers: 'true' },
        {},
      ]) {
        const res = await clone('admin', target, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      await clone('admin', 'no-es-uuid', { sourceYearId: year2026Id }).expect(400);
    });

    it('RF-15: 404 si no existe el destino o el origen', async () => {
      await clone('admin', randomUUID(), { sourceYearId: year2026Id }).expect(404);
      await clone('admin', years.get(2080)!, { sourceYearId: randomUUID() }).expect(404);
    });

    it('RF-15: 422 mismo año u origen no anterior al destino', async () => {
      await clone('admin', year2026Id, { sourceYearId: year2026Id }).expect(422);
      await clone('admin', years.get(2080)!, { sourceYearId: years.get(2081)! }).expect(422);
    });

    it('RF-15/D-030: 409 si el destino está cerrado (2025) o es de solo lectura (2019)', async () => {
      const closed = await clone('admin', year2025Id, { sourceYearId: years.get(2018)! });
      expect(closed.status).toBe(409);
      expect(closed.body.error.message).toBe('El año académico está cerrado');
      const readOnly = await clone('admin', years.get(2019)!, { sourceYearId: years.get(2018)! });
      expect(readOnly.status).toBe(409);
      expect(readOnly.body.error.message).toBe('El año académico es de solo lectura');
      expect(await prisma.section.count({ where: { academicYearId: years.get(2019)! } })).toBe(0);
    });

    it('RF-15: 422 si el origen no tiene secciones activas', async () => {
      const res = await clone('admin', years.get(2084)!, { sourceYearId: years.get(2083)! });
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe('El año de origen no tiene secciones activas');
      expect(auditOf('academic.year.clone_structure')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Clonación', () => {
    it('RF-15/D-029: clona 2026 en 2080 sin docentes, sin períodos nuevos ni matrículas', async () => {
      const target = years.get(2080)!;
      const before = await counts();
      const source = await sectionsOf(year2026Id);
      const activeSections = source.filter((s) => s.isActive);
      const expectedCs = activeSections.flatMap((s) => s.courseSections).filter((c) => c.isActive);

      const res = await clone('admin', target, { sourceYearId: year2026Id });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        targetYear: { id: target, year: 2080, isActive: false, closedAt: null, readOnly: false },
        sourceYearId: year2026Id,
        created: {
          sections: activeSections.length,
          courseSections: expectedCs.length,
          teachersAssigned: 0,
        },
        skipped: { inactiveSections: 0, teachersNotActive: 0 },
      });

      const cloned = await sectionsOf(target);
      expect(cloned.map((s) => `${s.gradeLevel}${s.code}`)).toEqual(
        activeSections.map((s) => `${s.gradeLevel}${s.code}`),
      );
      expect(cloned.every((s) => s.isActive)).toBe(true);
      for (const [i, s] of cloned.entries()) {
        expect(s.courseSections.map((c) => c.courseId).sort()).toEqual(
          activeSections[i].courseSections
            .filter((c) => c.isActive)
            .map((c) => c.courseId)
            .sort(),
        );
        expect(s.courseSections.every((c) => c.teacherId === null && c.isActive)).toBe(true);
      }

      const after = await counts();
      expect(after).toEqual({
        ...before,
        sections: before.sections + activeSections.length,
        courseSections: before.courseSections + expectedCs.length,
      });
      expect(await prisma.enrollment.count({ where: { academicYearId: target } })).toBe(0);
      expect(await prisma.academicPeriod.count({ where: { academicYearId: target } })).toBe(4);

      // Bitácora: una entrada sobre el año destino, solo ids, banderas y conteos.
      const audit = auditOf('academic.year.clone_structure');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: ids.get('admin'),
        module: 'academic',
        entityType: 'AcademicYear',
        entityId: target,
        afterState: {
          sourceYearId: year2026Id,
          copyTeachers: false,
          created: res.body.created,
          skipped: res.body.skipped,
        },
      });
      const text = JSON.stringify(audit[0]);
      expect(text).not.toMatch(/Docente|Ficticio|Matem|@colegio/);
    });

    it('RF-15: un segundo clon al mismo destino es 409 y no escribe nada', async () => {
      const before = await counts();
      const res = await clone('admin', years.get(2080)!, { sourceYearId: year2026Id });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('El año de destino ya tiene secciones');
      expect(await counts()).toEqual(before);
      expect(auditOf('academic.year.clone_structure')).toHaveLength(0);
    });

    it('RF-15: omite inactivos y, con copyTeachers, solo copia docentes TEACHER y ACTIVE', async () => {
      const source = years.get(2081)!;
      const target = years.get(2082)!;
      const [c1, c2, c3, c4] = await Promise.all(
        ['Uno', 'Dos', 'Tres', 'Cuatro'].map((n) =>
          prisma.course.create({ data: { name: `${COURSE_PREFIX}${n}` } }),
        ),
      );
      await prisma.course.update({ where: { id: c4.id }, data: { isActive: false } });
      // 1A activa: c1 con docente01 (activo), c2 con docente inactivo, c3 inactivo, c4 curso inactivo.
      await prisma.section.create({
        data: {
          academicYearId: source,
          gradeLevel: 1,
          code: 'A',
          courseSections: {
            createMany: {
              data: [
                { courseId: c1.id, teacherId: ids.get('docente01')! },
                { courseId: c2.id, teacherId: ids.get('docenteInactivo')! },
                { courseId: c3.id, teacherId: ids.get('docente02')!, isActive: false },
                { courseId: c4.id, teacherId: ids.get('docente01')! },
              ],
            },
          },
        },
      });
      // 2B activa sin cursos; 3C inactiva con un curso.
      await prisma.section.create({ data: { academicYearId: source, gradeLevel: 2, code: 'B' } });
      await prisma.section.create({
        data: {
          academicYearId: source,
          gradeLevel: 3,
          code: 'C',
          isActive: false,
          courseSections: { create: { courseId: c1.id, teacherId: ids.get('docente02')! } },
        },
      });

      const res = await clone('admin', target, { sourceYearId: source, copyTeachers: true });
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ sections: 2, courseSections: 2, teachersAssigned: 1 });
      expect(res.body.skipped).toEqual({
        inactiveSections: 1,
        inactiveCourseSections: 1,
        inactiveCourses: 1,
        teachersNotActive: 1,
      });

      const cloned = await sectionsOf(target);
      expect(cloned.map((s) => `${s.gradeLevel}${s.code}`)).toEqual(['1A', '2B']);
      const byCourse = new Map(cloned[0].courseSections.map((c) => [c.courseId, c.teacherId]));
      expect(byCourse).toEqual(
        new Map<string, string | null>([
          [c1.id, ids.get('docente01')!],
          [c2.id, null],
        ]),
      );
      expect(cloned[1].courseSections).toEqual([]);
      expect(auditOf('academic.year.clone_structure')[0].afterState).toMatchObject({
        sourceYearId: source,
        copyTeachers: true,
      });
    });

    it('RF-15: docente que dejó de ser TEACHER (sigue ACTIVE) no se copia; copyTeachers:false explícito', async () => {
      const source = years.get(2083)!;
      const target = years.get(2084)!;
      const course = await prisma.course.create({ data: { name: `${COURSE_PREFIX}Rol` } });
      const exTeacher = await prisma.user.create({
        data: {
          institutionalEmail: `${USER_PREFIX}exdocente@colegio.example`,
          fullName: 'QA Ex Docente',
          role: 'TEACHER',
          status: 'ACTIVE',
        },
      });
      await prisma.section.create({
        data: {
          academicYearId: source,
          gradeLevel: 5,
          code: 'R',
          courseSections: { create: { courseId: course.id, teacherId: exTeacher.id } },
        },
      });
      await prisma.user.update({ where: { id: exTeacher.id }, data: { role: 'ADMIN' } });

      const res = await clone('admin', target, { sourceYearId: source, copyTeachers: true });
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ sections: 1, courseSections: 1, teachersAssigned: 0 });
      expect(res.body.skipped.teachersNotActive).toBe(1);
      const cloned = await sectionsOf(target);
      expect(cloned[0].courseSections[0].teacherId).toBeNull();

      // La bitácora lleva ids, banderas y conteos, sin nombres ni correos.
      const audit = auditOf('academic.year.clone_structure');
      expect(audit).toHaveLength(1);
      expect(audit[0].afterState).toMatchObject({
        sourceYearId: source,
        copyTeachers: true,
        created: { sections: 1, courseSections: 1, teachersAssigned: 0 },
      });
      expect(JSON.stringify(audit[0])).not.toMatch(/QA|Rol|@colegio/);
    });

    it('RF-15: con un clon rechazado (409) el origen no cambia', async () => {
      const source = years.get(2081)!;
      const before = await sectionsOf(source);
      await clone('admin', years.get(2084)!, { sourceYearId: source }).expect(409);
      expect(await sectionsOf(source)).toEqual(before);
    });

    it('RF-15: dos clones simultáneos al mismo destino: uno 201 y el otro 409', async () => {
      const target = years.get(2085)!;
      const source = years.get(2081)!;
      const results = await Promise.all([
        clone('admin', target, { sourceYearId: source }),
        clone('admin', target, { sourceYearId: source }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await prisma.section.count({ where: { academicYearId: target } })).toBe(2);
      expect(auditOf('academic.year.clone_structure')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  it('Limpieza: los conteos del seed no cambian tras borrar los datos QA', async () => {
    await cleanQaData();
    expect(await counts()).toEqual(baseline);
  });
});
