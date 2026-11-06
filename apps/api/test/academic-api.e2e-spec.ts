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
import { AcademicAccessService } from './../src/modules/academic/academic-access.service.js';
import {
  AcademicEventPublisher,
  type AcademicEvent,
} from './../src/modules/academic/academic-events.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Usa MySQL real con el seed cargado (solo local con Docker). Cargan el .env de la raiz si existe.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const COURSE_PREFIX = 'QA-F2 ';
const QA_YEARS = [2095, 2096, 2097, 2098, 2099];
const I_2026_CLOSED_AT = new Date('2026-05-05T00:00:00.000Z');

const periodsOf = (year: number) => [
  { sequence: 1, startDate: `${year}-03-01`, endDate: `${year}-05-31` },
  { sequence: 2, startDate: `${year}-06-01`, endDate: `${year}-08-31` },
  { sequence: 3, startDate: `${year}-09-01`, endDate: `${year}-11-30` },
  { sequence: 4, startDate: `${year}-12-01`, endDate: `${year}-12-20` },
];

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('API academica F2 (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let sink: MemoryAuditSink;
  let events: AcademicEvent[];
  let unsubscribe: Array<() => void>;
  let access: AcademicAccessService;
  let baseline: Record<string, number>;
  let wasActive2026 = false;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>(); // correo local -> id
  const roles = new Map<string, Role>();

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string, url: string) =>
    http()
      .get(API + url)
      .set('Cookie', as(key));
  const post = (key: string, url: string, body?: object) =>
    http()
      .post(API + url)
      .set('Cookie', as(key))
      .send(body);
  const patch = (key: string, url: string, body: object) =>
    http()
      .patch(API + url)
      .set('Cookie', as(key))
      .send(body);
  const put = (key: string, url: string, body: object) =>
    http()
      .put(API + url)
      .set('Cookie', as(key))
      .send(body);

  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);
  const eventsOf = (type: AcademicEvent['type']) => events.filter((e) => e.type === type);

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
    const years = await prisma.academicYear.findMany({
      where: { year: { in: QA_YEARS } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
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
  };

  // Ids del seed
  let year2025Id: string;
  let year2026Id: string;
  let period1Of2026Id: string;
  let period1Of2025Id: string;
  let cs3AMath: string;
  let cs3BMath: string;

  // Datos propios
  let y2095: Json;
  let sec2095: Json;
  let course1: Json;
  let course2: Json;
  let cs2095: Json;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await cleanQaData(); // por si una corrida anterior se interrumpio
    baseline = await counts();

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    wasActive2026 = y2026.isActive === true;
    year2026Id = y2026.id;
    year2025Id = (await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } })).id;
    period1Of2026Id = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: year2026Id, sequence: 1 },
      })
    ).id;
    period1Of2025Id = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: year2025Id, sequence: 1 },
      })
    ).id;
    const csOf = async (code: string) =>
      (
        await prisma.courseSection.findFirstOrThrow({
          where: {
            course: { name: 'Matemática' },
            section: { academicYearId: year2026Id, gradeLevel: 3, code },
          },
        })
      ).id;
    cs3AMath = await csOf('A');
    cs3BMath = await csOf('B');

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    access = app.get(AcademicAccessService);
    events = [];
    const publisher = app.get(AcademicEventPublisher);
    unsubscribe = (
      ['period.closed.v1', 'period.reopened.v1', 'academic-year.closed.v1'] as const
    ).map((type) => publisher.on(type, (e) => void events.push(e as AcademicEvent)));

    const keys = [
      'admin',
      'docente01',
      'docente02',
      'estudiante01',
      'estudiante03',
      'estudiante11',
      'estudiante59',
      'estudiante60',
      'apoderado01',
      'apoderado02',
    ];
    const sessions = app.get(SessionService);
    for (const key of keys) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      roles.set(key, user.role as Role);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      unsubscribe?.forEach((off) => off());
      await cleanQaData();
      // Restaura el estado del seed.
      if (wasActive2026) {
        await prisma.academicYear.updateMany({
          where: { isActive: true },
          data: { isActive: null },
        });
        await prisma.academicYear.update({ where: { id: year2026Id }, data: { isActive: true } });
      }
      await prisma.academicPeriod.update({
        where: { id: period1Of2026Id },
        data: { closedAt: I_2026_CLOSED_AT },
      });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
    events.length = 0;
  });

  // ---------------------------------------------------------------------------
  describe('Autenticacion y roles por controlador', () => {
    const someId = randomUUID();
    const adminRoutes: Array<[string, string, string]> = [
      ['AcademicYears', 'get', '/academic-years'],
      ['AcademicPeriods', 'post', `/academic-periods/${someId}/close`],
      ['Sections', 'get', `/academic-years/${someId}/sections`],
      ['Courses', 'get', '/courses'],
      ['CourseSections', 'get', `/sections/${someId}/course-sections`],
    ];

    it.each(adminRoutes)(
      'RF-09/10/12/13/14: %s responde 401 sin sesion',
      async (_n, method, url) => {
        const res = await (http() as any)[method](API + url); // eslint-disable-line @typescript-eslint/no-explicit-any
        expect(res.status).toBe(401);
      },
    );

    it.each([
      ['GET /course-sections/:id/context', `/course-sections/${randomUUID()}/context`],
      ['GET /me/course-sections', '/me/course-sections'],
    ])('RF-14: %s responde 401 sin sesion', async (_n, url) => {
      await http()
        .get(API + url)
        .expect(401);
    });

    it.each(adminRoutes)(
      'RF-09/10/12/13/14: %s responde 403 a docente y estudiante',
      async (_n, method, url) => {
        for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
          const res = await (http() as any)[method](API + url).set('Cookie', as(key)); // eslint-disable-line @typescript-eslint/no-explicit-any
          expect(res.status, `${key} ${method} ${url}`).toBe(403);
        }
      },
    );

    it('RF-09/12/13/14: las escrituras tambien exigen ADMIN (403 a docente)', async () => {
      const body = {};
      await post('docente01', '/academic-years', body).expect(403);
      await patch('docente01', `/academic-periods/${someId}`, body).expect(403);
      await post('docente01', `/academic-years/${someId}/sections`, body).expect(403);
      await patch('docente01', `/sections/${someId}`, body).expect(403);
      await post('docente01', '/courses', body).expect(403);
      await patch('docente01', `/courses/${someId}`, body).expect(403);
      await put('docente01', `/course-sections/${someId}/teacher`, { teacherId: null }).expect(403);
    });

    it('RF-14: /me/course-sections responde 403 a ADMIN y APODERADO', async () => {
      await get('admin', '/me/course-sections').expect(403);
      await get('apoderado01', '/me/course-sections').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Contexto de Matemática 3A / 3B (RF-14, RN-12)', () => {
    const ctx = (key: string, id: string) => get(key, `/course-sections/${id}/context`);

    it('RF-14: docente01 (titular) ve el contexto de 3A con forma completa y sin datos personales', async () => {
      const res = await ctx('docente01', cs3AMath).expect(200);
      expect(res.body).toMatchObject({
        id: cs3AMath,
        isActive: true,
        readOnly: false,
        academicYear: { year: 2026, isActive: true, closedAt: null },
        section: { gradeLevel: 3, code: 'A', isActive: true },
        course: { name: 'Matemática' },
        teacher: { id: ids.get('docente01') },
      });
      expect(res.body.periods).toHaveLength(4);
      expect(res.body.periods[0]).toMatchObject({ sequence: 1, kind: 'FIRST_BIMESTER' });
      expect(res.body).toHaveProperty('currentPeriodId');
      expect(JSON.stringify(res.body)).not.toContain('@colegio.example');
    });

    it('RF-14: docente02 no es titular de 3A (403) pero si de 3B (200)', async () => {
      await ctx('docente02', cs3AMath).expect(403);
      await ctx('docente02', cs3BMath).expect(200);
      await ctx('docente01', cs3BMath).expect(403);
    });

    it('RF-14: estudiante01 (3A) 200; estudiante11 (3B) 403 en 3A', async () => {
      await ctx('estudiante01', cs3AMath).expect(200);
      await ctx('estudiante11', cs3AMath).expect(403);
    });

    it('RF-24/RN-12: estudiante03 (trasladado 3A a 3B) 403 en 3A y 200 en 3B', async () => {
      await ctx('estudiante03', cs3AMath).expect(403);
      await ctx('estudiante03', cs3BMath).expect(200);
    });

    it('RF-14: estudiante59 (INACTIVE) recibe 403', async () => {
      await ctx('estudiante59', cs3AMath).expect(403);
    });

    it('RF-14: estudiante60 (retirado, sin matricula vigente) recibe 403', async () => {
      await ctx('estudiante60', cs3AMath).expect(403);
    });

    it('RF-14: apoderado01 (hijos en 3A y 3B) 200 en ambas', async () => {
      await ctx('apoderado01', cs3AMath).expect(200);
      await ctx('apoderado01', cs3BMath).expect(200);
    });

    it('RF-14 (ajuste INFORME 2): apoderado02 (hijo estudiante02 en 3A) 200 en 3A y 403 en 3B', async () => {
      await ctx('apoderado02', cs3AMath).expect(200);
      await ctx('apoderado02', cs3BMath).expect(403);
    });

    it('RF-14: admin 200; id inexistente 404; id no UUID 400', async () => {
      await ctx('admin', cs3AMath).expect(200);
      await ctx('admin', randomUUID()).expect(404);
      await ctx('admin', 'no-es-uuid').expect(400);
      await ctx('docente01', randomUUID()).expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /me/course-sections (RF-14)', () => {
    it('docente01 ve sus 5 cursos del año activo', async () => {
      const res = await get('docente01', '/me/course-sections').expect(200);
      expect(res.body.total).toBe(5);
      expect(res.body.items).toHaveLength(5);
      for (const item of res.body.items) {
        expect(item.teacher.id).toBe(ids.get('docente01'));
        expect(item.academicYear.year).toBe(2026);
        expect(item).not.toHaveProperty('enrollmentId');
      }
    });

    it('estudiante01 ve 5 cursos de 3A con enrollmentId', async () => {
      const res = await get('estudiante01', '/me/course-sections').expect(200);
      expect(res.body.total).toBe(5);
      const enrollment = await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante01'), isCurrent: true },
      });
      for (const item of res.body.items) {
        expect(item.section).toMatchObject({ gradeLevel: 3, code: 'A' });
        expect(item.enrollmentId).toBe(enrollment.id);
      }
    });

    it('estudiante60 (retirado) recibe lista vacia', async () => {
      const res = await get('estudiante60', '/me/course-sections').expect(200);
      expect(res.body).toEqual({ items: [], total: 0 });
    });

    it('estudiante59 (INACTIVE) recibe lista vacia', async () => {
      const res = await get('estudiante59', '/me/course-sections').expect(200);
      expect(res.body).toEqual({ items: [], total: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Años y períodos (RF-09, RF-10, RF-11, RF-17, RN-10, RN-11)', () => {
    it('RF-09: crea el año 2095 con 4 períodos (201) y lo deja inactivo', async () => {
      const res = await post('admin', '/academic-years', {
        year: 2095,
        periods: periodsOf(2095),
      }).expect(201);
      y2095 = res.body;
      expect(y2095).toMatchObject({ year: 2095, isActive: false, closedAt: null, readOnly: false });
      expect(y2095.periods.map((p: Json) => p.kind)).toEqual([
        'FIRST_BIMESTER',
        'SECOND_BIMESTER',
        'THIRD_TRIMESTER',
        'FOURTH_TRIMESTER',
      ]);
      expect(y2095.periods[0]).toMatchObject({ label: 'I Bimestre', isOpen: false });
      const logs = auditOf('academic.year.create');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        module: 'academic',
        entityId: y2095.id,
        actorId: ids.get('admin'),
      });
      const row = await prisma.academicYear.findUniqueOrThrow({ where: { id: y2095.id } });
      expect(row.isActive).toBeNull(); // marcador NULL, nunca false
    });

    it('RF-09: año repetido 409', async () => {
      await post('admin', '/academic-years', { year: 2095, periods: periodsOf(2095) }).expect(409);
      await post('admin', '/academic-years', { year: 2026, periods: periodsOf(2026) }).expect(409);
    });

    it('RF-09/RF-10: fechas invalidas 422 (fin antes de inicio, fuera del año, solapes)', async () => {
      const bad = (mutate: (p: ReturnType<typeof periodsOf>) => void) => {
        const p = periodsOf(2094);
        mutate(p);
        return post('admin', '/academic-years', { year: 2094, periods: p });
      };
      await bad((p) => {
        p[0].endDate = '2094-02-01';
      }).expect(422);
      await bad((p) => {
        p[3].endDate = '2095-01-10';
      }).expect(422);
      await bad((p) => {
        p[1].startDate = '2094-05-15';
      }).expect(422);
      expect(await prisma.academicYear.count({ where: { year: 2094 } })).toBe(0);
    });

    it('RF-09: cuerpo invalido 400 (3 períodos, año fuera de rango, secuencias repetidas)', async () => {
      await post('admin', '/academic-years', {
        year: 2094,
        periods: periodsOf(2094).slice(0, 3),
      }).expect(400);
      await post('admin', '/academic-years', { year: 1999, periods: periodsOf(1999) }).expect(400);
      const dup = periodsOf(2094);
      dup[1].sequence = 1;
      await post('admin', '/academic-years', { year: 2094, periods: dup }).expect(400);
    });

    it('RF-17: GET /academic-years lista descendente y marca los de solo lectura', async () => {
      const res = await get('admin', '/academic-years').expect(200);
      const years = res.body.items.map((y: Json) => y.year);
      expect(years).toEqual([...years].sort((a, b) => b - a));
      const byYear = (n: number) => res.body.items.find((y: Json) => y.year === n);
      expect(byYear(2025)).toMatchObject({ readOnly: true, isActive: false });
      expect(byYear(2026)).toMatchObject({ readOnly: false, isActive: true });
      expect(byYear(2095)).toMatchObject({ readOnly: false });
      expect(res.body.total).toBe(res.body.items.length);
      await get('admin', `/academic-years/${year2025Id}`).expect(200);
      await get('admin', `/academic-years/${randomUUID()}`).expect(404);
    });

    it('RF-09: PATCH renombra un año sin secciones y mueve las fechas de los períodos', async () => {
      const created = await post('admin', '/academic-years', {
        year: 2099,
        periods: periodsOf(2099),
      }).expect(201);
      const res = await patch('admin', `/academic-years/${created.body.id}`, { year: 2098 }).expect(
        200,
      );
      expect(res.body.year).toBe(2098);
      expect(res.body.periods[0].startDate).toBe('2098-03-01');
      expect(res.body.periods[3].endDate).toBe('2098-12-20');
      expect(auditOf('academic.year.update')[0]).toMatchObject({
        beforeState: { year: 2099 },
        afterState: { year: 2098 },
      });
      await patch('admin', `/academic-years/${created.body.id}`, { year: 2095 }).expect(409);
    });

    it('RF-09: no se puede renombrar el año activo ni uno con secciones', async () => {
      await patch('admin', `/academic-years/${year2026Id}`, { year: 2097 }).expect(409);
    });

    it('RF-10: PATCH de período — fechas validas 200, solapes 422, sin campos 400', async () => {
      const p1 = y2095.periods[0].id;
      const ok = await patch('admin', `/academic-periods/${p1}`, { endDate: '2095-05-30' }).expect(
        200,
      );
      expect(ok.body.endDate).toBe('2095-05-30');
      expect(auditOf('academic.period.update')).toHaveLength(1);
      await patch('admin', `/academic-periods/${p1}`, { endDate: '2095-06-15' }).expect(422);
      await patch('admin', `/academic-periods/${p1}`, {}).expect(400);
      await patch('admin', `/academic-periods/${randomUUID()}`, { endDate: '2095-05-30' }).expect(
        404,
      );
    });

    it('RF-10: no se editan fechas de un período de un año cerrado/solo lectura (409)', async () => {
      await patch('admin', `/academic-periods/${period1Of2025Id}`, {
        endDate: '2025-05-06',
      }).expect(409);
    });

    it('RF-17: cerrar un año con períodos abiertos 422', async () => {
      const y = await post('admin', '/academic-years', {
        year: 2096,
        periods: periodsOf(2096),
      }).expect(201);
      await post('admin', `/academic-years/${y.body.id}/close`).expect(422);
      const row = await prisma.academicYear.findUniqueOrThrow({ where: { id: y.body.id } });
      expect(row.closedAt).toBeNull();
    });

    it('RF-11/RF-17: cierra los 4 períodos (evento y bitácora) y luego el año (evento, solo lectura)', async () => {
      const y = await post('admin', '/academic-years', {
        year: 2097,
        periods: periodsOf(2097),
      }).expect(201);
      for (const p of y.body.periods) {
        const res = await post('admin', `/academic-periods/${p.id}/close`, {
          reason: 'Fin de periodo QA',
        }).expect(200);
        expect(res.body).toMatchObject({ id: p.id, isOpen: false });
        expect(res.body.closedAt).toEqual(expect.any(String));
        await post('admin', `/academic-periods/${p.id}/close`).expect(409); // ya cerrado
      }
      expect(eventsOf('period.closed.v1')).toHaveLength(4);
      expect(eventsOf('period.closed.v1')[0].payload).toMatchObject({ academicYearId: y.body.id });
      const closeLogs = auditOf('academic.period.close');
      expect(closeLogs).toHaveLength(4);
      expect(closeLogs[0].afterState).toMatchObject({ reason: 'Fin de periodo QA' });

      const closed = await post('admin', `/academic-years/${y.body.id}/close`).expect(200);
      expect(closed.body).toMatchObject({ year: 2097, isActive: false, readOnly: true });
      expect(closed.body.closedAt).toEqual(expect.any(String));
      expect(eventsOf('academic-year.closed.v1')).toHaveLength(1);
      expect(eventsOf('academic-year.closed.v1')[0].payload).toMatchObject({
        academicYearId: y.body.id,
        year: 2097,
      });
      expect(auditOf('academic.year.close')).toHaveLength(1);
      await post('admin', `/academic-years/${y.body.id}/close`).expect(409);

      // año cerrado: solo lectura
      await post('admin', `/academic-years/${y.body.id}/sections`, {
        gradeLevel: 1,
        code: 'A',
      }).expect(409);
      await post('admin', `/academic-periods/${y.body.periods[0].id}/reopen`, {
        reason: 'Motivo suficientemente largo',
      }).expect(409);
      await post('admin', `/academic-years/${y.body.id}/activate`).expect(409);
      expect(await access.isPeriodOpen(y.body.periods[0].id)).toBe(false);
    });

    it('RN-10: reabrir un período cerrado sin motivo (o con motivo corto) 400, el período sigue cerrado', async () => {
      await post('admin', `/academic-periods/${period1Of2026Id}/reopen`, {}).expect(400);
      await post('admin', `/academic-periods/${period1Of2026Id}/reopen`, {
        reason: 'corto',
      }).expect(400);
      const row = await prisma.academicPeriod.findUniqueOrThrow({ where: { id: period1Of2026Id } });
      expect(row.closedAt).not.toBeNull();
      expect(eventsOf('period.reopened.v1')).toHaveLength(0);
    });

    it('RN-10/RF-11: reabrir I-2026 con motivo 200, evento y bitácora con motivo; isPeriodOpen cambia', async () => {
      expect(await access.isPeriodOpen(period1Of2026Id)).toBe(false);
      const reason = 'Correccion de notas solicitada por direccion';
      const res = await post('admin', `/academic-periods/${period1Of2026Id}/reopen`, {
        reason,
      }).expect(200);
      expect(res.body).toMatchObject({ id: period1Of2026Id, closedAt: null, isOpen: true });
      expect(eventsOf('period.reopened.v1')).toHaveLength(1);
      expect(eventsOf('period.reopened.v1')[0].payload).toMatchObject({
        periodId: period1Of2026Id,
      });
      const logs = auditOf('academic.period.reopen');
      expect(logs).toHaveLength(1);
      expect(logs[0].afterState).toMatchObject({ closedAt: null, reason });
      expect(await access.isPeriodOpen(period1Of2026Id)).toBe(true);
      await post('admin', `/academic-periods/${period1Of2026Id}/reopen`, { reason }).expect(409); // ya abierto
    });

    it('RF-11: volver a cerrar I-2026 publica period.closed.v1', async () => {
      const res = await post('admin', `/academic-periods/${period1Of2026Id}/close`, {}).expect(200);
      expect(res.body.isOpen).toBe(false);
      expect(eventsOf('period.closed.v1')).toHaveLength(1);
      expect(await access.isPeriodOpen(period1Of2026Id)).toBe(false);
    });

    it('RF-11: reabrir un período del año 2025 (cerrado, no activo) 409', async () => {
      await post('admin', `/academic-periods/${period1Of2025Id}/reopen`, {
        reason: 'Intento de reabrir un año anterior',
      }).expect(409);
      expect(eventsOf('period.reopened.v1')).toHaveLength(0);
      expect(await access.isPeriodOpen(period1Of2025Id)).toBe(false);
    });

    it('RF-11: isPeriodOpen — 404 si no existe; false en un año no activo aunque el período este abierto', async () => {
      await expect(access.isPeriodOpen(randomUUID())).rejects.toMatchObject({ status: 404 });
      expect(await access.isPeriodOpen(y2095.periods[1].id)).toBe(false); // 2095 aun no esta activo
    });
  });

  // ---------------------------------------------------------------------------
  describe('Secciones, cursos y docentes (RF-12, RF-13, RF-14)', () => {
    it('RF-12: crea una sección en 2095 (código a mayúsculas) con bitácora', async () => {
      const res = await post('admin', `/academic-years/${y2095.id}/sections`, {
        gradeLevel: 3,
        code: 'qa1',
      }).expect(201);
      sec2095 = res.body;
      expect(sec2095).toMatchObject({
        gradeLevel: 3,
        code: 'QA1',
        isActive: true,
        academicYearId: y2095.id,
      });
      expect(auditOf('academic.section.create')).toHaveLength(1);
      const list = await get('admin', `/academic-years/${y2095.id}/sections`).expect(200);
      expect(list.body.total).toBe(1);
    });

    it('RF-12: sección duplicada 409; datos invalidos 400; año inexistente 404', async () => {
      await post('admin', `/academic-years/${y2095.id}/sections`, {
        gradeLevel: 3,
        code: 'QA1',
      }).expect(409);
      await post('admin', `/academic-years/${y2095.id}/sections`, {
        gradeLevel: 6,
        code: 'A',
      }).expect(400);
      await post('admin', `/academic-years/${y2095.id}/sections`, {
        gradeLevel: 1,
        code: 'codigo-largo!',
      }).expect(400);
      await post('admin', `/academic-years/${randomUUID()}/sections`, {
        gradeLevel: 1,
        code: 'A',
      }).expect(404);
    });

    it('RF-12/RF-17: crear sección en 2025 (año cerrado) 409', async () => {
      await post('admin', `/academic-years/${year2025Id}/sections`, {
        gradeLevel: 1,
        code: 'ZZ',
      }).expect(409);
      expect(
        await prisma.section.count({ where: { academicYearId: year2025Id, code: 'ZZ' } }),
      ).toBe(0);
    });

    it('RF-12: PATCH de sección cambia el código; duplicado 409; sin cambios no registra bitácora', async () => {
      await post('admin', `/academic-years/${y2095.id}/sections`, {
        gradeLevel: 3,
        code: 'QA2',
      }).expect(201);
      sink.records.length = 0;
      await patch('admin', `/sections/${sec2095.id}`, { code: 'QA2' }).expect(409);
      const ok = await patch('admin', `/sections/${sec2095.id}`, { code: 'QA3' }).expect(200);
      expect(ok.body.code).toBe('QA3');
      expect(auditOf('academic.section.update')).toHaveLength(1);
      sink.records.length = 0;
      await patch('admin', `/sections/${sec2095.id}`, { code: 'QA3' }).expect(200);
      expect(auditOf('academic.section.update')).toHaveLength(0);
    });

    it('RF-12: no se puede desactivar una sección con matrículas vigentes (3A-2026) 409', async () => {
      const s3A = await prisma.section.findFirstOrThrow({
        where: { academicYearId: year2026Id, gradeLevel: 3, code: 'A' },
      });
      await patch('admin', `/sections/${s3A.id}`, { isActive: false }).expect(409);
      expect((await prisma.section.findUniqueOrThrow({ where: { id: s3A.id } })).isActive).toBe(
        true,
      );
    });

    it('RF-13: crea cursos QA-F2, nombre duplicado 409, lista oculta inactivos por defecto', async () => {
      const a = await post('admin', '/courses', { name: `${COURSE_PREFIX}Uno` }).expect(201);
      const b = await post('admin', '/courses', { name: `${COURSE_PREFIX}Dos` }).expect(201);
      course1 = a.body;
      course2 = b.body;
      expect(auditOf('academic.course.create')).toHaveLength(2);
      await post('admin', '/courses', { name: `${COURSE_PREFIX}Uno` }).expect(409);
      await post('admin', '/courses', { name: '' }).expect(400);

      await patch('admin', `/courses/${course2.id}`, { isActive: false }).expect(200);
      const row = await prisma.course.findUniqueOrThrow({ where: { id: course2.id } });
      expect(row.isActive).toBe(false);
      const visible = await get('admin', '/courses').expect(200);
      const names = visible.body.items.map((c: Json) => c.name);
      expect(names).toContain(`${COURSE_PREFIX}Uno`);
      expect(names).not.toContain(`${COURSE_PREFIX}Dos`);
      const all = await get('admin', '/courses?includeInactive=true').expect(200);
      expect(all.body.items.map((c: Json) => c.name)).toContain(`${COURSE_PREFIX}Dos`);
      await patch('admin', `/courses/${course1.id}`, { name: `${COURSE_PREFIX}Dos` }).expect(409);
      await patch('admin', `/courses/${randomUUID()}`, { name: `${COURSE_PREFIX}X` }).expect(404);
    });

    it('RF-14: asigna el curso a la sección sin docente (201); duplicado 409; curso inactivo 422', async () => {
      const res = await post('admin', `/sections/${sec2095.id}/course-sections`, {
        courseId: course1.id,
      }).expect(201);
      cs2095 = res.body;
      expect(cs2095).toMatchObject({ sectionId: sec2095.id, teacher: null, isActive: true });
      expect(auditOf('academic.course_section.create')).toHaveLength(1);
      await post('admin', `/sections/${sec2095.id}/course-sections`, {
        courseId: course1.id,
      }).expect(409);
      await post('admin', `/sections/${sec2095.id}/course-sections`, {
        courseId: course2.id,
      }).expect(422);
      await post('admin', `/sections/${sec2095.id}/course-sections`, {
        courseId: randomUUID(),
      }).expect(404);
      await post('admin', `/sections/${randomUUID()}/course-sections`, {
        courseId: course1.id,
      }).expect(404);
    });

    it('RF-14: docente no válido 422 (estudiante, apoderado, id inexistente)', async () => {
      for (const teacherId of [ids.get('estudiante01'), ids.get('apoderado01'), randomUUID()]) {
        const res = await put('admin', `/course-sections/${cs2095.id}/teacher`, {
          teacherId,
        }).expect(422);
        expect(JSON.stringify(res.body)).toContain('docente');
      }
      await put('admin', `/course-sections/${cs2095.id}/teacher`, { teacherId: 'no-uuid' }).expect(
        400,
      );
      const row = await prisma.courseSection.findUniqueOrThrow({ where: { id: cs2095.id } });
      expect(row.teacherId).toBeNull();
      expect(auditOf('academic.course_section.assign_teacher')).toHaveLength(0);
    });

    it('RF-14/D-029: asigna a docente02 (200, bitácora), repetir no registra, reasigna y quita', async () => {
      const t2 = ids.get('docente02');
      const res = await put('admin', `/course-sections/${cs2095.id}/teacher`, {
        teacherId: t2,
      }).expect(200);
      expect(res.body.teacher).toMatchObject({ id: t2 });
      let logs = auditOf('academic.course_section.assign_teacher');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        entityId: cs2095.id,
        beforeState: { teacherId: null },
        afterState: { teacherId: t2 },
      });

      sink.records.length = 0;
      await put('admin', `/course-sections/${cs2095.id}/teacher`, { teacherId: t2 }).expect(200);
      expect(auditOf('academic.course_section.assign_teacher')).toHaveLength(0);

      await put('admin', `/course-sections/${cs2095.id}/teacher`, {
        teacherId: ids.get('docente01'),
      }).expect(200);
      logs = auditOf('academic.course_section.assign_teacher');
      expect(logs[0]).toMatchObject({
        beforeState: { teacherId: t2 },
        afterState: { teacherId: ids.get('docente01') },
      });

      await put('admin', `/course-sections/${cs2095.id}/teacher`, { teacherId: null }).expect(200);
      expect(
        (await prisma.courseSection.findUniqueOrThrow({ where: { id: cs2095.id } })).teacherId,
      ).toBeNull();
      await put('admin', `/course-sections/${cs2095.id}/teacher`, { teacherId: t2 }).expect(200);
      await put('admin', `/course-sections/${randomUUID()}/teacher`, { teacherId: t2 }).expect(404);
    });

    it('RF-14: PATCH curso-sección desactiva/activa; el listado y el context lo reflejan', async () => {
      const off = await patch('admin', `/course-sections/${cs2095.id}`, { isActive: false }).expect(
        200,
      );
      expect(off.body.isActive).toBe(false);
      const ctxOff = await get('admin', `/course-sections/${cs2095.id}/context`).expect(200);
      expect(ctxOff.body).toMatchObject({ isActive: false, readOnly: true });
      await patch('admin', `/course-sections/${cs2095.id}`, { isActive: true }).expect(200);
      const list = await get('admin', `/sections/${sec2095.id}/course-sections`).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({ id: cs2095.id, course: { id: course1.id } });
      expect(auditOf('academic.course_section.update')).toHaveLength(2);
    });

    it('RF-14/RF-17: asignar docente o crear curso-sección en año de solo lectura (2025) 409', async () => {
      const sec2025 = await prisma.section.findFirstOrThrow({
        where: { academicYearId: year2025Id },
      });
      // Se inserta directo (la API lo prohibe) y se limpia por el prefijo del curso QA-F2.
      const cs2025 = await prisma.courseSection.create({
        data: { sectionId: sec2025.id, courseId: course1.id },
      });
      await put('admin', `/course-sections/${cs2025.id}/teacher`, {
        teacherId: ids.get('docente02'),
      }).expect(409);
      await patch('admin', `/course-sections/${cs2025.id}`, { isActive: false }).expect(409);
      await post('admin', `/sections/${cs2025.sectionId}/course-sections`, {
        courseId: course1.id,
      }).expect(409);
    });

    it('RF-14: assertTeacherOf / assertCourseSectionWritable (servicio) sobre datos QA', async () => {
      await expect(
        access.assertTeacherOf(ids.get('docente02')!, cs2095.id),
      ).resolves.toBeUndefined();
      await expect(access.assertTeacherOf(ids.get('docente01')!, cs2095.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        access.assertTeacherOf(ids.get('docente01')!, randomUUID()),
      ).rejects.toMatchObject({ status: 404 });
      // 2095 aun no esta activo: no se puede escribir (409)
      await expect(access.assertCourseSectionWritable(cs2095.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(access.assertCourseSectionWritable(cs3AMath)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Activación de año (RN-11) — restaura 2026 al terminar', () => {
    it('RN-11: activar 2025 (cerrado) 409 y no cambia el año activo', async () => {
      await post('admin', `/academic-years/${year2025Id}/activate`).expect(409);
      expect(
        (await prisma.academicYear.findUniqueOrThrow({ where: { id: year2026Id } })).isActive,
      ).toBe(true);
    });

    it('RN-11: activar 2095 deja un solo año activo; reactivar es idempotente; reactivar 2026 restaura', async () => {
      try {
        const res = await post('admin', `/academic-years/${y2095.id}/activate`).expect(200);
        expect(res.body).toMatchObject({ year: 2095, isActive: true });
        expect(auditOf('academic.year.activate')).toHaveLength(1);
        expect(auditOf('academic.year.deactivate')).toHaveLength(1);

        const rows = await prisma.academicYear.findMany({ where: { isActive: true } });
        expect(rows.map((r) => r.year)).toEqual([2095]);
        expect(
          (await prisma.academicYear.findUniqueOrThrow({ where: { id: year2026Id } })).isActive,
        ).toBeNull();

        // 2095 activo: sus períodos abiertos cuentan como abiertos y se puede escribir en su curso-sección
        expect(await access.isPeriodOpen(y2095.periods[1].id)).toBe(true);
        await expect(
          access.assertCourseSectionWritable(cs2095.id, y2095.periods[1].id),
        ).resolves.toBeUndefined();
        await expect(
          access.assertCourseSectionWritable(cs2095.id, period1Of2026Id),
        ).rejects.toMatchObject({ status: 422 });
        // 2026 ya no es el activo: /me no devuelve sus cursos
        const me = await get('docente01', '/me/course-sections').expect(200);
        expect(me.body.total).toBe(0);

        sink.records.length = 0;
        await post('admin', `/academic-years/${y2095.id}/activate`).expect(200);
        expect(auditOf('academic.year.activate')).toHaveLength(0);
      } finally {
        const back = await post('admin', `/academic-years/${year2026Id}/activate`);
        expect(back.status).toBe(200);
      }
      const rows = await prisma.academicYear.findMany({ where: { isActive: true } });
      expect(rows.map((r) => r.year)).toEqual([2026]);
      expect(
        (await prisma.academicYear.findUniqueOrThrow({ where: { id: y2095.id } })).isActive,
      ).toBeNull();
      const me = await get('docente01', '/me/course-sections').expect(200);
      expect(me.body.total).toBe(5);
    });

    it('RN-11: el año 2026 vuelve a ser editable y 2025 sigue en solo lectura', async () => {
      const list = await get('admin', '/academic-years').expect(200);
      expect(list.body.items.find((y: Json) => y.year === 2026)).toMatchObject({
        isActive: true,
        readOnly: false,
      });
      expect(list.body.items.find((y: Json) => y.year === 2025)).toMatchObject({ readOnly: true });
    });
  });

  // ---------------------------------------------------------------------------
  it('Limpieza: los conteos del seed no cambian tras borrar los datos QA (verificacion previa a afterAll)', async () => {
    await cleanQaData();
    expect(await counts()).toEqual(baseline);
  });
});
