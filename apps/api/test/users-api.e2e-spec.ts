import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  AcademicEventPublisher,
  type AcademicEvent,
} from './../src/modules/academic/academic-events.js';
import { INSTITUTION_EMAIL_DOMAIN } from './../src/modules/users/institution-domain.js';
import { MemoryAuditSink } from './helpers.js';

// Usa MySQL real con el seed cargado (solo local con Docker). Cargan el .env de la raiz si existe.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const QA_PREFIX = 'qa-f3-';
const QA_COURSE = 'QA-F3 Curso';
const QA_YEAR = 2092;
const DOMAIN = 'colegio.example';
// Usuarios QA creados por Prisma en beforeAll (sinmat y admin2), contados en las listas.
const QA_FIXTURE_USERS = 2;
const qa = (key: string) => `${QA_PREFIX}${key}@${DOMAIN}`;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('API usuarios y matriculas F3 (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let sink: MemoryAuditSink;
  let sessions: SessionService;
  let events: AcademicEvent[];
  let unsubscribe: Array<() => void>;
  let baseline: Record<string, number>;

  const cookies = new Map<string, string>();
  const ids = new Map<string, string>(); // clave local -> id

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

  const auditOf = (action: string, entityId?: string) =>
    sink.records.filter(
      (r) => r.action === action && (entityId === undefined || r.entityId === entityId),
    );
  const eventsOf = (type: AcademicEvent['type']) => events.filter((e) => e.type === type);
  const statuses = (results: Array<{ status: number }>) =>
    results.map((r) => r.status).sort((a, b) => a - b);

  const counts = async () => ({
    years: await prisma.academicYear.count(),
    periods: await prisma.academicPeriod.count(),
    sections: await prisma.section.count(),
    courses: await prisma.course.count(),
    courseSections: await prisma.courseSection.count(),
    users: await prisma.user.count(),
    enrollments: await prisma.enrollment.count(),
    currentEnrollments: await prisma.enrollment.count({ where: { isCurrent: true } }),
    links: await prisma.guardianStudent.count(),
    activeLinks: await prisma.guardianStudent.count({ where: { isActive: true } }),
  });

  /** Borra solo lo creado por este archivo (usuarios qa-f3-*, curso QA, seccion 3Q, año 2092). */
  const cleanQaData = async () => {
    const users = await prisma.user.findMany({
      where: { institutionalEmail: { startsWith: QA_PREFIX } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.courseSection.deleteMany({ where: { course: { name: QA_COURSE } } });
    await prisma.courseSection.updateMany({
      where: { teacherId: { in: userIds } },
      data: { teacherId: null },
    });
    await prisma.course.deleteMany({ where: { name: QA_COURSE } });
    await prisma.guardianStudent.deleteMany({
      where: { OR: [{ guardianId: { in: userIds } }, { studentId: { in: userIds } }] },
    });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const y2026 = await prisma.academicYear.findUnique({ where: { year: 2026 } });
    if (y2026) {
      await prisma.section.deleteMany({ where: { academicYearId: y2026.id, code: 'Q' } });
    }
    const qaYear = await prisma.academicYear.findUnique({ where: { year: QA_YEAR } });
    if (qaYear) {
      await prisma.section.deleteMany({ where: { academicYearId: qaYear.id } });
      await prisma.academicYear.delete({ where: { id: qaYear.id } });
    }
  };

  const createSession = async (key: string, userId: string, role: Role) => {
    ids.set(key, userId);
    cookies.set(key, await sessions.create({ id: userId, role }));
  };

  // Ids del seed
  let sec3A: string;
  let sec3B: string;
  let sec4A: string;
  let sec2A2025: string;
  let sec3Q: string; // seccion QA inactiva (2026, 3Q)
  let secOtherYear: string; // seccion QA en el año 2092 (no activo)
  let cs3AMath: string;
  let cs3BMath: string;

  // Datos propios
  let s1: Json; // { user, enrollment }
  let g1: Json; // { user, links }
  let s2: Json;
  let s3: Json;
  let linkS1G1: Json;
  let sinMat: string; // estudiante QA sin matricula (creado por Prisma)

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await cleanQaData(); // por si una corrida anterior se interrumpio
    baseline = await counts();

    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const y2025 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } });
    const sectionOf = async (academicYearId: string, gradeLevel: number, code: string) =>
      (await prisma.section.findFirstOrThrow({ where: { academicYearId, gradeLevel, code } })).id;
    sec3A = await sectionOf(y2026.id, 3, 'A');
    sec3B = await sectionOf(y2026.id, 3, 'B');
    sec4A = await sectionOf(y2026.id, 4, 'A');
    sec2A2025 = await sectionOf(y2025.id, 2, 'A');
    const csOf = async (sectionId: string) =>
      (
        await prisma.courseSection.findFirstOrThrow({
          where: { course: { name: 'Matemática' }, sectionId },
        })
      ).id;
    cs3AMath = await csOf(sec3A);
    cs3BMath = await csOf(sec3B);

    // Fixtures QA creados por Prisma: seccion inactiva en 2026 y seccion de un año no activo.
    sec3Q = (
      await prisma.section.create({
        data: { academicYearId: y2026.id, gradeLevel: 3, code: 'Q', isActive: false },
      })
    ).id;
    const qaYear = await prisma.academicYear.create({ data: { year: QA_YEAR, isActive: null } });
    secOtherYear = (
      await prisma.section.create({
        data: { academicYearId: qaYear.id, gradeLevel: 3, code: 'Y' },
      })
    ).id;
    sinMat = (
      await prisma.user.create({
        data: {
          institutionalEmail: qa('sinmat'),
          fullName: 'QA F3 Sin Matricula',
          role: 'STUDENT',
        },
      })
    ).id;
    const admin2 = await prisma.user.create({
      data: { institutionalEmail: qa('admin2'), fullName: 'QA F3 Admin Dos', role: 'ADMIN' },
    });

    sink = new MemoryAuditSink();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionStore)
      .useValue(new MemorySessionStore())
      .overrideProvider(AuditSink)
      .useValue(sink)
      .overrideProvider(INSTITUTION_EMAIL_DOMAIN)
      .useValue(DOMAIN)
      .compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    sessions = app.get(SessionService);

    events = [];
    const publisher = app.get(AcademicEventPublisher);
    unsubscribe = (['user.status-changed.v1', 'enrollment.transferred.v1'] as const).map((type) =>
      publisher.on(type, (e) => void events.push(e as AcademicEvent)),
    );

    for (const key of [
      'admin',
      'docente01',
      'docente02',
      'estudiante01',
      'estudiante03',
      'estudiante59',
      'estudiante60',
      'apoderado01',
      'apoderado02',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@${DOMAIN}` },
      });
      await createSession(key, user.id, user.role as Role);
    }
    await createSession('admin2', admin2.id, 'ADMIN');
  });

  afterAll(async () => {
    try {
      unsubscribe?.forEach((off) => off());
      await cleanQaData();
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  // ---------------------------------------------------------------------------
  describe('Autenticacion y roles (RF-18..25)', () => {
    const someId = randomUUID();
    const routes: Array<[string, string, string]> = [
      ['GET /users', 'get', '/users'],
      ['GET /users/:id', 'get', `/users/${someId}`],
      ['PATCH /users/:id', 'patch', `/users/${someId}`],
      ['PUT /users/:id/status', 'put', `/users/${someId}/status`],
      ['POST /students', 'post', '/students'],
      ['POST /students/:id/enrollments', 'post', `/students/${someId}/enrollments`],
      ['POST /students/:id/transfer', 'post', `/students/${someId}/transfer`],
      ['GET /students/:id/enrollments', 'get', `/students/${someId}/enrollments`],
      ['GET /students/:id/guardians', 'get', `/students/${someId}/guardians`],
      ['POST /teachers', 'post', '/teachers'],
      ['POST /guardians', 'post', '/guardians'],
      ['GET /guardians/:id/students', 'get', `/guardians/${someId}/students`],
      ['POST /guardians/:id/students', 'post', `/guardians/${someId}/students`],
      ['POST /guardian-links/:id/revoke', 'post', `/guardian-links/${someId}/revoke`],
    ];

    it.each(routes)('RF-18..25: %s responde 401 sin sesion', async (_n, method, url) => {
      const res = await (http() as any)[method](API + url); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(res.status).toBe(401);
    });

    it.each(routes)(
      'RF-18..25: %s responde 403 a docente, estudiante y apoderado',
      async (_n, method, url) => {
        for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
          const res = await (http() as any)[method](API + url).set('Cookie', as(key)); // eslint-disable-line @typescript-eslint/no-explicit-any
          expect(res.status, `${key} ${method} ${url}`).toBe(403);
        }
      },
    );
  });

  // ---------------------------------------------------------------------------
  describe('Lectura con el seed (RF-25, RF-24)', () => {
    it('RF-25: lista paginada por defecto: forma de la vista y total del seed', async () => {
      const res = await get('admin', '/users').expect(200);
      expect(res.body).toMatchObject({
        total: baseline.users + QA_FIXTURE_USERS,
        page: 1,
        pageSize: 20,
      });
      expect(res.body.items).toHaveLength(20);
      const item = res.body.items[0];
      expect(Object.keys(item).sort()).toEqual(
        ['currentSection', 'fullName', 'id', 'institutionalEmail', 'role', 'status'].sort(),
      );
    });

    it('RF-25: paginacion sin solapes y pagina fuera de rango vacia', async () => {
      const p1 = await get('admin', '/users?pageSize=5&page=1').expect(200);
      const p2 = await get('admin', '/users?pageSize=5&page=2').expect(200);
      expect(p1.body.items).toHaveLength(5);
      expect(p2.body.items).toHaveLength(5);
      const seen = new Set([...p1.body.items, ...p2.body.items].map((u: Json) => u.id));
      expect(seen.size).toBe(10);
      const far = await get('admin', '/users?pageSize=5&page=1000').expect(200);
      expect(far.body.items).toEqual([]);
      expect(far.body.total).toBe(baseline.users + QA_FIXTURE_USERS);
    });

    it('RF-25: role=STUDENT&gradeLevel=3 devuelve 20 estudiantes', async () => {
      const res = await get('admin', '/users?role=STUDENT&gradeLevel=3&pageSize=100').expect(200);
      expect(res.body.total).toBe(20);
      expect(res.body.items.every((u: Json) => u.role === 'STUDENT')).toBe(true);
      expect(res.body.items.every((u: Json) => u.currentSection.gradeLevel === 3)).toBe(true);
    });

    it('RF-25/RF-24: sectionId=3A devuelve 9 (estudiante03 ya esta en 3B)', async () => {
      const res = await get('admin', `/users?role=STUDENT&sectionId=${sec3A}&pageSize=100`).expect(
        200,
      );
      expect(res.body.total).toBe(9);
      expect(res.body.items.map((u: Json) => u.institutionalEmail)).not.toContain(
        `estudiante03@${DOMAIN}`,
      );
      expect(res.body.items.every((u: Json) => u.currentSection.code === 'A')).toBe(true);
    });

    it('RF-25: q=docente devuelve los 5 docentes del seed (sin distinguir mayusculas)', async () => {
      const res = await get('admin', '/users?q=DOCENTE').expect(200);
      expect(res.body.total).toBe(5);
      expect(res.body.items.every((u: Json) => u.role === 'TEACHER')).toBe(true);
    });

    it('RF-25: q encuentra un estudiante por nombre y muestra su seccion vigente', async () => {
      const res = await get('admin', '/users?q=Estudiante Ficticio 01').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].currentSection).toMatchObject({ gradeLevel: 3, code: 'A' });
    });

    it('RF-25: status=WITHDRAWN devuelve solo a estudiante60', async () => {
      const res = await get('admin', '/users?status=WITHDRAWN').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].institutionalEmail).toBe(`estudiante60@${DOMAIN}`);
      expect(res.body.items[0].currentSection).toBeNull();
    });

    it('RF-25: role=STUDENT&status=INACTIVE devuelve solo a estudiante59', async () => {
      const res = await get('admin', '/users?role=STUDENT&status=INACTIVE').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].institutionalEmail).toBe(`estudiante59@${DOMAIN}`);
    });

    it.each(['%%', '__'])('RF-25: q=%s no actua como comodin (0 resultados)', async (q) => {
      const res = await get('admin', `/users?q=${encodeURIComponent(q)}`).expect(200);
      expect(res.body.total).toBe(0);
      expect(res.body.items).toEqual([]);
    });

    it('RF-25: parametros invalidos responden 400', async () => {
      await get('admin', '/users?pageSize=101').expect(400);
      await get('admin', '/users?pageSize=0').expect(400);
      await get('admin', '/users?page=0').expect(400);
      await get('admin', '/users?q=a').expect(400);
      await get('admin', '/users?role=TEACHER&gradeLevel=3').expect(400);
      await get('admin', '/users?gradeLevel=3').expect(400);
      await get('admin', '/users?role=STUDENT&gradeLevel=6').expect(400);
      await get('admin', '/users?role=NADIE').expect(400);
      await get('admin', '/users?foo=1').expect(400);
      await get('admin', '/users?role=STUDENT&sectionId=no-uuid').expect(400);
    });

    it('RF-25: GET /users/:id de estudiante01 trae matricula vigente y apoderado vigente', async () => {
      const res = await get('admin', `/users/${ids.get('estudiante01')}`).expect(200);
      expect(res.body).toMatchObject({ role: 'STUDENT', status: 'ACTIVE' });
      expect(res.body.currentEnrollment).toMatchObject({
        isCurrent: true,
        academicYear: { year: 2026 },
        section: { gradeLevel: 3, code: 'A' },
      });
      expect(res.body.guardians).toHaveLength(1);
      expect(res.body.guardians[0].guardian.id).toBe(ids.get('apoderado01'));
    });

    it('RF-25: GET /users/:id de apoderado01 trae sus 2 estudiantes; docente sin extras', async () => {
      const g = await get('admin', `/users/${ids.get('apoderado01')}`).expect(200);
      expect(g.body.students).toHaveLength(2);
      const t = await get('admin', `/users/${ids.get('docente01')}`).expect(200);
      expect(t.body.students).toBeUndefined();
      expect(t.body.guardians).toBeUndefined();
      expect(t.body.currentEnrollment).toBeUndefined();
    });

    it('RF-25: GET /users/:id con id invalido 400 y desconocido 404', async () => {
      await get('admin', '/users/no-uuid').expect(400);
      await get('admin', `/users/${randomUUID()}`).expect(404);
    });

    it('RF-24: historial de estudiante03: 3A cerrada TRANSFER y 3B vigente', async () => {
      const res = await get('admin', `/students/${ids.get('estudiante03')}/enrollments`).expect(
        200,
      );
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toMatchObject({
        isCurrent: false,
        endReason: 'TRANSFER',
        section: { gradeLevel: 3, code: 'A' },
      });
      expect(res.body.items[0].effectiveTo).not.toBeNull();
      expect(res.body.items[1]).toMatchObject({
        isCurrent: true,
        endReason: null,
        effectiveTo: null,
        section: { gradeLevel: 3, code: 'B' },
      });
    });

    it('RF-24: historial de estudiante01: 2025 YEAR_END y 2026 vigente; filtro por año', async () => {
      const res = await get('admin', `/students/${ids.get('estudiante01')}/enrollments`).expect(
        200,
      );
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toMatchObject({
        endReason: 'YEAR_END',
        academicYear: { year: 2025 },
      });
      const yearId = res.body.items[1].academicYear.id;
      const only = await get(
        'admin',
        `/students/${ids.get('estudiante01')}/enrollments?academicYearId=${yearId}`,
      ).expect(200);
      expect(only.body.total).toBe(1);
      expect(only.body.items[0].academicYear.year).toBe(2026);
    });

    it('RF-23: historial de estudiante60: una matricula cerrada WITHDRAWAL', async () => {
      const res = await get('admin', `/students/${ids.get('estudiante60')}/enrollments`).expect(
        200,
      );
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({ isCurrent: false, endReason: 'WITHDRAWAL' });
    });

    it('RF-24: historial de un docente 422, id desconocido 404, academicYearId invalido 400', async () => {
      await get('admin', `/students/${ids.get('docente01')}/enrollments`).expect(422);
      await get('admin', `/students/${randomUUID()}/enrollments`).expect(404);
      await get(
        'admin',
        `/students/${ids.get('estudiante01')}/enrollments?academicYearId=x`,
      ).expect(400);
    });

    it('RF-20/RN-13: vinculos del seed: del estudiante y del apoderado, con includeRevoked', async () => {
      const a = await get('admin', `/students/${ids.get('estudiante01')}/guardians`).expect(200);
      expect(a.body.total).toBe(1);
      expect(a.body.items[0]).toMatchObject({ isActive: true, revokedAt: null });
      const b = await get('admin', `/guardians/${ids.get('apoderado01')}/students`).expect(200);
      expect(b.body.total).toBe(2);
      const c = await get(
        'admin',
        `/guardians/${ids.get('apoderado01')}/students?includeRevoked=true`,
      ).expect(200);
      expect(c.body.total).toBe(2);
      await get('admin', `/guardians/${ids.get('estudiante01')}/students`).expect(422);
      await get('admin', `/students/${ids.get('apoderado01')}/guardians`).expect(422);
      await get('admin', `/guardians/${randomUUID()}/students`).expect(404);
      await get(
        'admin',
        `/guardians/${ids.get('apoderado01')}/students?includeRevoked=quizas`,
      ).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Alta de estudiante con matricula (RF-18)', () => {
    it('RF-18: crea estudiante y matricula vigente en 3A; normaliza el correo; bitacora sin datos personales', async () => {
      const res = await post('admin', '/students', {
        institutionalEmail: `  ${qa('Alumno1').toUpperCase().replace('@COLEGIO', '@Colegio')} `,
        fullName: '  QA   F3 Alumno   Uno ',
        sectionId: sec3A,
      }).expect(201);
      s1 = res.body;
      await createSession('s1', s1.user.id, 'STUDENT');
      expect(s1.user).toMatchObject({
        institutionalEmail: qa('alumno1'),
        fullName: 'QA F3 Alumno Uno',
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      expect(s1.enrollment).toMatchObject({
        isCurrent: true,
        effectiveTo: null,
        endReason: null,
        academicYear: { year: 2026 },
        section: { id: sec3A, gradeLevel: 3, code: 'A' },
      });
      // Fecha puesta por el servidor.
      expect(Math.abs(Date.now() - new Date(s1.enrollment.effectiveFrom).getTime())).toBeLessThan(
        60_000,
      );
      const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: s1.enrollment.id } });
      expect(row).toMatchObject({ isCurrent: true, sectionId: sec3A });

      expect(auditOf('users.user.create', s1.user.id)).toHaveLength(1);
      expect(auditOf('users.enrollment.create', s1.enrollment.id)).toHaveLength(1);
      expect(auditOf('users.user.create', s1.user.id)[0]).toMatchObject({
        module: 'users',
        entityType: 'User',
        afterState: { role: 'STUDENT', status: 'ACTIVE' },
      });
    });

    it('RF-18: correo repetido 409 (tambien con otras mayusculas) y el del seed 409', async () => {
      await post('admin', '/students', {
        institutionalEmail: qa('alumno1').toUpperCase().replace('@COLEGIO', '@colegio'),
        fullName: 'QA F3 Repetido',
        sectionId: sec3A,
      }).expect(409);
      await post('admin', '/students', {
        institutionalEmail: `estudiante01@${DOMAIN}`,
        fullName: 'QA F3 Repetido',
        sectionId: sec3A,
      }).expect(409);
    });

    it('RF-18: seccion de un año cerrado 409; de un año no activo 422; inactiva 409; inexistente 404', async () => {
      const body = (key: string, sectionId: string) => ({
        institutionalEmail: qa(key),
        fullName: 'QA F3 Rechazado',
        sectionId,
      });
      await post('admin', '/students', body('rech1', sec2A2025)).expect(409);
      await post('admin', '/students', body('rech2', secOtherYear)).expect(422);
      await post('admin', '/students', body('rech3', sec3Q)).expect(409);
      await post('admin', '/students', body('rech4', randomUUID())).expect(404);
      expect(
        await prisma.user.count({
          where: { institutionalEmail: { startsWith: `${QA_PREFIX}rech` } },
        }),
      ).toBe(0);
    });

    it('RF-18/RNF-09: dominio ajeno 422; validacion de cuerpo 400 (campo desconocido, fechas del cliente)', async () => {
      await post('admin', '/students', {
        institutionalEmail: 'qa-f3-ajeno@otro.example',
        fullName: 'QA F3 Ajeno',
        sectionId: sec3A,
      }).expect(422);
      const ok = {
        institutionalEmail: qa('val'),
        fullName: 'QA F3 Valida',
        sectionId: sec3A,
      };
      await post('admin', '/students', { ...ok, role: 'ADMIN' }).expect(400);
      await post('admin', '/students', { ...ok, effectiveFrom: '2020-01-01T00:00:00Z' }).expect(
        400,
      );
      await post('admin', '/students', { ...ok, fullName: 'ab' }).expect(400);
      await post('admin', '/students', { ...ok, fullName: 'QA F3\tTab' }).expect(400);
      await post('admin', '/students', { ...ok, institutionalEmail: 'no-es-correo' }).expect(400);
      await post('admin', '/students', { ...ok, sectionId: 'no-uuid' }).expect(400);
      await post('admin', '/students', { institutionalEmail: ok.institutionalEmail }).expect(400);
      expect(await prisma.user.count({ where: { institutionalEmail: qa('val') } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Apoderado y vinculos (RF-20, RN-13)', () => {
    it('RF-20: crea apoderado con su estudiante en una transaccion (201)', async () => {
      const res = await post('admin', '/guardians', {
        institutionalEmail: qa('apo1'),
        fullName: 'QA F3 Apoderado Uno',
        studentIds: [s1.user.id],
      }).expect(201);
      g1 = res.body;
      await createSession('g1', g1.user.id, 'GUARDIAN');
      expect(g1.user).toMatchObject({ role: 'GUARDIAN', status: 'ACTIVE' });
      expect(g1.links).toHaveLength(1);
      linkS1G1 = g1.links[0];
      expect(linkS1G1).toMatchObject({
        isActive: true,
        revokedAt: null,
        guardian: { id: g1.user.id },
        student: { id: s1.user.id },
      });
      expect(auditOf('users.user.create', g1.user.id)).toHaveLength(1);
      expect(auditOf('users.guardian_link.create', linkS1G1.id)).toHaveLength(1);
    });

    it('RF-20: validaciones del alta (correo repetido 409, listas invalidas 400, roles y retirados 422) sin dejar usuarios', async () => {
      const base = { fullName: 'QA F3 Apoderado Malo' };
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apo1'),
        studentIds: [s1.user.id],
      }).expect(409);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: [],
      }).expect(400);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: [s1.user.id, s1.user.id],
      }).expect(400);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: Array.from({ length: 11 }, () => randomUUID()),
      }).expect(400);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: [ids.get('docente01')],
      }).expect(422);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: [ids.get('estudiante60')], // WITHDRAWN
      }).expect(422);
      await post('admin', '/guardians', {
        ...base,
        institutionalEmail: qa('apoX'),
        studentIds: [s1.user.id, randomUUID()],
      }).expect(422);
      expect(await prisma.user.count({ where: { institutionalEmail: qa('apoX') } })).toBe(0);
    });

    it('RF-20/D-013: el apoderado esta exento del dominio institucional (201)', async () => {
      const res = await post('admin', '/guardians', {
        institutionalEmail: 'qa-f3-apo-ext@otro.example',
        fullName: 'QA F3 Apoderado Externo',
        studentIds: [s1.user.id],
      }).expect(201);
      expect(res.body.user.role).toBe('GUARDIAN');
    });

    it('RN-12: el apoderado y el estudiante ven el curso de 3A, no el de 3B', async () => {
      for (const key of ['g1', 's1']) {
        await get(key, `/course-sections/${cs3AMath}/context`).expect(200);
        await get(key, `/course-sections/${cs3BMath}/context`).expect(403);
      }
    });

    it('RN-13: vincular valida roles, mismo id, inexistentes y duplicado', async () => {
      const apoId = g1.user.id;
      await post('admin', `/guardians/${apoId}/students`, { studentId: s1.user.id }).expect(409);
      await post('admin', `/guardians/${apoId}/students`, { studentId: apoId }).expect(422);
      await post('admin', `/guardians/${apoId}/students`, {
        studentId: ids.get('docente01'),
      }).expect(422);
      await post('admin', `/guardians/${apoId}/students`, {
        studentId: ids.get('estudiante60'),
      }).expect(422);
      await post('admin', `/guardians/${ids.get('docente01')}/students`, {
        studentId: s1.user.id,
      }).expect(422);
      await post('admin', `/guardians/${ids.get('estudiante01')}/students`, {
        studentId: s1.user.id,
      }).expect(422);
      await post('admin', `/guardians/${randomUUID()}/students`, { studentId: s1.user.id }).expect(
        404,
      );
      await post('admin', `/guardians/${apoId}/students`, { studentId: randomUUID() }).expect(404);
      await post('admin', `/guardians/${apoId}/students`, { studentId: 'x' }).expect(400);
      await post('admin', `/guardians/${apoId}/students`, {
        studentId: s1.user.id,
        isActive: true,
      }).expect(400);
      const total = await prisma.guardianStudent.count({ where: { guardianId: apoId } });
      expect(total).toBe(1);
    });

    it('RN-13: revocar sin motivo o con motivo corto 400; id desconocido 404', async () => {
      await post('admin', `/guardian-links/${linkS1G1.id}/revoke`).expect(400);
      await post('admin', `/guardian-links/${linkS1G1.id}/revoke`, { reason: 'corto' }).expect(400);
      await post('admin', `/guardian-links/${linkS1G1.id}/revoke`, {
        reason: 'x'.repeat(501),
      }).expect(400);
      await post('admin', '/guardian-links/no-uuid/revoke', {
        reason: 'Motivo suficientemente largo',
      }).expect(400);
      await post('admin', `/guardian-links/${randomUUID()}/revoke`, {
        reason: 'Motivo suficientemente largo',
      }).expect(404);
      const row = await prisma.guardianStudent.findUniqueOrThrow({ where: { id: linkS1G1.id } });
      expect(row).toMatchObject({ isActive: true, revokedAt: null });
    });

    it('RN-13: revoca (200), guarda NULL + revokedAt, audita el motivo y el apoderado pierde el acceso', async () => {
      const res = await post('admin', `/guardian-links/${linkS1G1.id}/revoke`, {
        reason: 'Cambio de tutor legal acreditado',
      }).expect(200);
      expect(res.body).toMatchObject({ id: linkS1G1.id, isActive: false });
      expect(res.body.revokedAt).not.toBeNull();
      expect(new Date(res.body.revokedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body.createdAt).getTime(),
      );
      const row = await prisma.guardianStudent.findUniqueOrThrow({ where: { id: linkS1G1.id } });
      expect(row.isActive).toBeNull();
      expect(row.revokedAt).not.toBeNull();
      const logs = auditOf('users.guardian_link.revoke', linkS1G1.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        beforeState: { isActive: true },
        afterState: { isActive: false, reason: 'Cambio de tutor legal acreditado' },
      });
      await get('g1', `/course-sections/${cs3AMath}/context`).expect(403);
      await get('s1', `/course-sections/${cs3AMath}/context`).expect(200); // el estudiante sigue
    });

    it('RN-13: revocar otra vez 409; revincular crea un id nuevo y includeRevoked muestra 2', async () => {
      await post('admin', `/guardian-links/${linkS1G1.id}/revoke`, {
        reason: 'Motivo suficientemente largo',
      }).expect(409);
      const again = await post('admin', `/guardians/${g1.user.id}/students`, {
        studentId: s1.user.id,
      }).expect(201);
      expect(again.body.id).not.toBe(linkS1G1.id);
      expect(again.body).toMatchObject({ isActive: true, revokedAt: null });
      await get('g1', `/course-sections/${cs3AMath}/context`).expect(200);

      const vigentes = await get('admin', `/guardians/${g1.user.id}/students`).expect(200);
      expect(vigentes.body.total).toBe(1);
      const all = await get(
        'admin',
        `/guardians/${g1.user.id}/students?includeRevoked=true`,
      ).expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items.filter((l: Json) => l.isActive)).toHaveLength(1);
      expect(all.body.items.filter((l: Json) => !l.isActive)).toHaveLength(1);
      const byStudent = await get(
        'admin',
        `/students/${s1.user.id}/guardians?includeRevoked=true`,
      ).expect(200);
      expect(byStudent.body.total).toBe(3); // g1 revocado, g1 vigente y el apoderado externo
    });
  });

  // ---------------------------------------------------------------------------
  describe('Traslado (RF-24)', () => {
    it('RF-24: traslada 3A -> 3B con fechas del servidor, bitacora y evento; cambia el acceso', async () => {
      await get('g1', `/course-sections/${cs3AMath}/context`).expect(200);
      const res = await post('admin', `/students/${s1.user.id}/transfer`, {
        sectionId: sec3B,
        reason: 'Cambio de turno solicitado',
      }).expect(200);
      const { closed, current } = res.body;
      expect(closed).toMatchObject({
        id: s1.enrollment.id,
        isCurrent: false,
        endReason: 'TRANSFER',
        section: { id: sec3A },
      });
      expect(current).toMatchObject({
        isCurrent: true,
        endReason: null,
        effectiveTo: null,
        section: { id: sec3B, gradeLevel: 3, code: 'B' },
        academicYear: { year: 2026 },
      });
      expect(closed.effectiveTo).toBe(current.effectiveFrom);
      expect(new Date(closed.effectiveTo).getTime()).toBeGreaterThanOrEqual(
        new Date(closed.effectiveFrom).getTime(),
      );

      const rows = await prisma.enrollment.findMany({ where: { studentId: s1.user.id } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.isCurrent === true)).toHaveLength(1);
      expect(rows.filter((r) => r.isCurrent === null)).toHaveLength(1);

      const logs = auditOf('users.enrollment.transfer', current.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        module: 'users',
        beforeState: { enrollmentId: closed.id, sectionId: sec3A },
        afterState: {
          enrollmentId: current.id,
          sectionId: sec3B,
          endReason: 'TRANSFER',
          reason: 'Cambio de turno solicitado',
        },
      });
      const evs = eventsOf('enrollment.transferred.v1').filter(
        (e) => (e.payload as Json).studentId === s1.user.id,
      );
      expect(evs).toHaveLength(1);
      expect(evs[0]!.payload).toMatchObject({
        academicYearId: current.academicYear.id,
        fromEnrollmentId: closed.id,
        toEnrollmentId: current.id,
        fromSectionId: sec3A,
        toSectionId: sec3B,
      });

      for (const key of ['g1', 's1']) {
        await get(key, `/course-sections/${cs3AMath}/context`).expect(403);
        await get(key, `/course-sections/${cs3BMath}/context`).expect(200);
      }
    });

    it('RF-24: misma seccion 422, otro grado 422, inactiva 409, otro año 422/409, inexistente 404', async () => {
      const t = (sectionId: string) =>
        post('admin', `/students/${s1.user.id}/transfer`, { sectionId });
      await t(sec3B).expect(422);
      await t(sec4A).expect(422);
      await t(sec3Q).expect(409);
      await t(secOtherYear).expect(422);
      await t(sec2A2025).expect(409);
      await t(randomUUID()).expect(404);
      const current = await prisma.enrollment.findMany({
        where: { studentId: s1.user.id, isCurrent: true },
      });
      expect(current).toHaveLength(1);
      expect(current[0]!.sectionId).toBe(sec3B);
    });

    it('RF-24: destinatario invalido (docente 422, desconocido 404), cuerpo invalido 400, sin matricula vigente 409', async () => {
      await post('admin', `/students/${ids.get('docente01')}/transfer`, {
        sectionId: sec3B,
      }).expect(422);
      await post('admin', `/students/${randomUUID()}/transfer`, { sectionId: sec3B }).expect(404);
      await post('admin', `/students/${s1.user.id}/transfer`, { sectionId: 'x' }).expect(400);
      await post('admin', `/students/${s1.user.id}/transfer`, {
        sectionId: sec3A,
        reason: '',
      }).expect(400);
      await post('admin', `/students/${s1.user.id}/transfer`, {
        sectionId: sec3A,
        effectiveFrom: '2020-01-01',
      }).expect(400);
      await post('admin', `/students/${sinMat}/transfer`, { sectionId: sec3B }).expect(409);
    });

    it('RF-24: dos traslados identicos en paralelo se serializan: uno 200 y otro 422', async () => {
      const created = await post('admin', '/students', {
        institutionalEmail: qa('alumno2'),
        fullName: 'QA F3 Alumno Dos',
        sectionId: sec3A,
      }).expect(201);
      s2 = created.body;
      const results = await Promise.all([
        post('admin', `/students/${s2.user.id}/transfer`, { sectionId: sec3B }),
        post('admin', `/students/${s2.user.id}/transfer`, { sectionId: sec3B }),
      ]);
      expect(statuses(results)).toEqual([200, 422]);
      const rows = await prisma.enrollment.findMany({ where: { studentId: s2.user.id } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.isCurrent === true)).toHaveLength(1);
      expect(
        eventsOf('enrollment.transferred.v1').filter(
          (e) => (e.payload as Json).studentId === s2.user.id,
        ),
      ).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Concurrencia (bloqueos de fila)', () => {
    it('RF-18: dos altas con el mismo correo en paralelo: 201 y 409, un solo usuario', async () => {
      const body = {
        institutionalEmail: qa('carrera'),
        fullName: 'QA F3 Carrera',
        sectionId: sec3A,
      };
      const results = await Promise.all([
        post('admin', '/students', body),
        post('admin', '/students', body),
      ]);
      expect(statuses(results)).toEqual([201, 409]);
      expect(
        await prisma.user.count({ where: { institutionalEmail: body.institutionalEmail } }),
      ).toBe(1);
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: body.institutionalEmail },
      });
      expect(await prisma.enrollment.count({ where: { studentId: user.id } })).toBe(1);
    });

    it('RF-24: dos matriculas en paralelo del mismo estudiante sin matricula: 201 y 409', async () => {
      const results = await Promise.all([
        post('admin', `/students/${sinMat}/enrollments`, { sectionId: sec3A }),
        post('admin', `/students/${sinMat}/enrollments`, { sectionId: sec3A }),
      ]);
      expect(statuses(results)).toEqual([201, 409]);
      expect(await prisma.enrollment.count({ where: { studentId: sinMat, isCurrent: true } })).toBe(
        1,
      );
    });

    it('RN-13: dos vinculos identicos en paralelo: 201 y 409, un solo vigente', async () => {
      const results = await Promise.all([
        post('admin', `/guardians/${g1.user.id}/students`, { studentId: s2.user.id }),
        post('admin', `/guardians/${g1.user.id}/students`, { studentId: s2.user.id }),
      ]);
      expect(statuses(results)).toEqual([201, 409]);
      expect(
        await prisma.guardianStudent.count({
          where: { guardianId: g1.user.id, studentId: s2.user.id, isActive: true },
        }),
      ).toBe(1);
    });

    it('RN-13: dos revocaciones en paralelo del mismo vinculo: 200 y 409', async () => {
      const link = await prisma.guardianStudent.findFirstOrThrow({
        where: { guardianId: g1.user.id, studentId: s2.user.id, isActive: true },
      });
      const reason = 'Revocacion concurrente de prueba';
      const results = await Promise.all([
        post('admin', `/guardian-links/${link.id}/revoke`, { reason }),
        post('admin', `/guardian-links/${link.id}/revoke`, { reason }),
      ]);
      expect(statuses(results)).toEqual([200, 409]);
      expect(auditOf('users.guardian_link.revoke', link.id)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Matricula de estudiante existente (RF-18)', () => {
    it('RF-18: matricula en 4A (201); ya vigente 409; docente 422; inexistente 404; seccion inactiva 409', async () => {
      // sinMat ya quedo matriculado en 3A por la prueba de concurrencia.
      await post('admin', `/students/${sinMat}/enrollments`, { sectionId: sec4A }).expect(409);
      await post('admin', `/students/${ids.get('docente01')}/enrollments`, {
        sectionId: sec3A,
      }).expect(422);
      await post('admin', `/students/${randomUUID()}/enrollments`, { sectionId: sec3A }).expect(
        404,
      );
      await post('admin', `/students/${sinMat}/enrollments`, { sectionId: sec3Q }).expect(409);
      await post('admin', `/students/${sinMat}/enrollments`, { sectionId: secOtherYear }).expect(
        422,
      );
      await post('admin', `/students/${sinMat}/enrollments`, { sectionId: 'x' }).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Estados (RF-23)', () => {
    it('RF-23: WITHDRAWN cierra la matricula vigente (WITHDRAWAL), audita y publica el evento', async () => {
      const created = await post('admin', '/students', {
        institutionalEmail: qa('alumno3'),
        fullName: 'QA F3 Alumno Tres',
        sectionId: sec3A,
      }).expect(201);
      s3 = created.body;
      const res = await put('admin', `/users/${s3.user.id}/status`, {
        status: 'WITHDRAWN',
        reason: 'Retiro voluntario',
      }).expect(200);
      expect(res.body.user).toMatchObject({ id: s3.user.id, status: 'WITHDRAWN' });
      expect(res.body.closedEnrollments).toHaveLength(1);
      const closed = res.body.closedEnrollments[0];
      expect(closed).toMatchObject({
        id: s3.enrollment.id,
        isCurrent: false,
        endReason: 'WITHDRAWAL',
      });
      expect(new Date(closed.effectiveTo).getTime()).toBeGreaterThanOrEqual(
        new Date(closed.effectiveFrom).getTime(),
      );
      const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: s3.enrollment.id } });
      expect(row.isCurrent).toBeNull();

      expect(auditOf('users.user.status_change', s3.user.id)[0]).toMatchObject({
        beforeState: { status: 'ACTIVE' },
        afterState: { status: 'WITHDRAWN', reason: 'Retiro voluntario' },
      });
      expect(auditOf('users.enrollment.withdraw', s3.enrollment.id)).toHaveLength(1);
      const evs = eventsOf('user.status-changed.v1').filter(
        (e) => (e.payload as Json).userId === s3.user.id,
      );
      expect(evs).toHaveLength(1);
      expect(evs[0]!.payload).toMatchObject({
        role: 'STUDENT',
        previousStatus: 'ACTIVE',
        status: 'WITHDRAWN',
        closedEnrollmentIds: [s3.enrollment.id],
      });
    });

    it('RF-23: un estudiante WITHDRAWN no se matricula, traslada ni vincula (422)', async () => {
      await post('admin', `/students/${s3.user.id}/enrollments`, { sectionId: sec3A }).expect(422);
      await post('admin', `/students/${s3.user.id}/transfer`, { sectionId: sec3B }).expect(422);
      await post('admin', `/guardians/${g1.user.id}/students`, { studentId: s3.user.id }).expect(
        422,
      );
    });

    it('RF-23: volver a ACTIVE no reabre la matricula; la rematricula crea una nueva', async () => {
      await put('admin', `/users/${s3.user.id}/status`, { status: 'ACTIVE' }).expect(200);
      const detail = await get('admin', `/users/${s3.user.id}`).expect(200);
      expect(detail.body.currentEnrollment).toBeNull();
      const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: s3.enrollment.id } });
      expect(row.isCurrent).toBeNull();
      await post('admin', `/students/${s3.user.id}/transfer`, { sectionId: sec3B }).expect(409);

      const re = await post('admin', `/students/${s3.user.id}/enrollments`, {
        sectionId: sec4A,
      }).expect(201);
      expect(re.body).toMatchObject({ isCurrent: true, section: { id: sec4A } });
      expect(re.body.id).not.toBe(s3.enrollment.id);
      const history = await get('admin', `/students/${s3.user.id}/enrollments`).expect(200);
      expect(history.body.total).toBe(2);
    });

    it('RF-23: INACTIVE no toca la matricula y permite trasladar', async () => {
      const res = await put('admin', `/users/${s2.user.id}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(res.body.closedEnrollments).toEqual([]);
      const detail = await get('admin', `/users/${s2.user.id}`).expect(200);
      expect(detail.body.status).toBe('INACTIVE');
      expect(detail.body.currentEnrollment).toMatchObject({ isCurrent: true });
      await post('admin', `/students/${s2.user.id}/transfer`, { sectionId: sec3A }).expect(200);
    });

    it('RF-23: mismo estado devuelve 200 sin bitacora ni evento', async () => {
      const before = auditOf('users.user.status_change', s2.user.id).length;
      const evBefore = eventsOf('user.status-changed.v1').length;
      const res = await put('admin', `/users/${s2.user.id}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(res.body.user.status).toBe('INACTIVE');
      expect(res.body.closedEnrollments).toEqual([]);
      expect(auditOf('users.user.status_change', s2.user.id)).toHaveLength(before);
      expect(eventsOf('user.status-changed.v1')).toHaveLength(evBefore);
    });

    it('RF-23: cuerpo invalido 400, usuario inexistente 404 y el admin no cambia su propio estado (409)', async () => {
      await put('admin', `/users/${s2.user.id}/status`, { status: 'BORRADO' }).expect(400);
      await put('admin', `/users/${s2.user.id}/status`, {}).expect(400);
      await put('admin', `/users/${s2.user.id}/status`, { status: 'ACTIVE', reason: '' }).expect(
        400,
      );
      await put('admin', `/users/${s2.user.id}/status`, { status: 'ACTIVE', role: 'ADMIN' }).expect(
        400,
      );
      await put('admin', `/users/${randomUUID()}/status`, { status: 'ACTIVE' }).expect(404);
      await put('admin', `/users/${ids.get('admin')}/status`, { status: 'INACTIVE' }).expect(409);
      await put('admin2', `/users/${ids.get('admin2')}/status`, { status: 'INACTIVE' }).expect(409);
      const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.get('admin')! } });
      expect(admin.status).toBe('ACTIVE');
    });

    it('RF-08: un ADMIN pasado a INACTIVE pierde el acceso al modulo aunque conserve la sesion (403)', async () => {
      await get('admin2', '/users?pageSize=1').expect(200);
      const res = await put('admin', `/users/${ids.get('admin2')}/status`, {
        status: 'INACTIVE',
      }).expect(200);
      expect(res.body.user.status).toBe('INACTIVE');
      await get('admin2', '/users?pageSize=1').expect(403);
      await post('admin2', '/teachers', {
        institutionalEmail: qa('docx'),
        fullName: 'QA F3 No Debe Crearse',
      }).expect(403);
      expect(await prisma.user.count({ where: { institutionalEmail: qa('docx') } })).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Docentes (RF-19)', () => {
    it('RF-19: crea un docente (201), audita, y rechaza repetido, dominio ajeno y cuerpo invalido', async () => {
      const res = await post('admin', '/teachers', {
        institutionalEmail: qa('profe1'),
        fullName: 'QA F3 Profe Uno',
      }).expect(201);
      expect(res.body).toMatchObject({ role: 'TEACHER', status: 'ACTIVE' });
      ids.set('profe1', res.body.id);
      expect(auditOf('users.user.create', res.body.id)).toHaveLength(1);

      await post('admin', '/teachers', {
        institutionalEmail: qa('profe1'),
        fullName: 'QA F3 Profe Uno',
      }).expect(409);
      await post('admin', '/teachers', {
        institutionalEmail: `docente01@${DOMAIN}`,
        fullName: 'QA F3 Profe Dos',
      }).expect(409);
      await post('admin', '/teachers', {
        institutionalEmail: 'qa-f3-profe9@otro.example',
        fullName: 'QA F3 Profe Nueve',
      }).expect(422);
      await post('admin', '/teachers', {
        institutionalEmail: qa('profe8'),
        fullName: 'QA F3 Profe Ocho',
        role: 'ADMIN',
      }).expect(400);
      await post('admin', '/teachers', { institutionalEmail: qa('profe8') }).expect(400);
      expect(await prisma.user.count({ where: { institutionalEmail: qa('profe8') } })).toBe(0);
    });

    it('RF-19/RF-14: el docente nuevo es asignable a un curso-seccion y ve su contexto', async () => {
      const course = await post('admin', '/courses', { name: QA_COURSE }).expect(201);
      const cs = await post('admin', `/sections/${sec3A}/course-sections`, {
        courseId: course.body.id,
      }).expect(201);
      const res = await put('admin', `/course-sections/${cs.body.id}/teacher`, {
        teacherId: ids.get('profe1'),
      }).expect(200);
      expect(res.body.teacher).toMatchObject({ id: ids.get('profe1') });
      await createSession('profe1', ids.get('profe1')!, 'TEACHER');
      await get('profe1', `/course-sections/${cs.body.id}/context`).expect(200);
      await get('profe1', `/course-sections/${cs3AMath}/context`).expect(403);
      await get('profe1', '/users').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Edicion (RF-22)', () => {
    it('RF-22: cambia el nombre (200) y la bitacora solo guarda los nombres de campo', async () => {
      const res = await patch('admin', `/users/${s1.user.id}`, {
        fullName: 'QA F3 Alumno Uno Editado',
      }).expect(200);
      expect(res.body.fullName).toBe('QA F3 Alumno Uno Editado');
      const logs = auditOf('users.user.update', s1.user.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ afterState: { changedFields: ['fullName'] } });
      expect(JSON.stringify(logs[0])).not.toContain('Editado');
    });

    it('RF-22: sin cambios reales responde 200 y no registra bitacora', async () => {
      const before = auditOf('users.user.update', s1.user.id).length;
      const res = await patch('admin', `/users/${s1.user.id}`, {
        fullName: '  QA F3 Alumno   Uno Editado ',
        institutionalEmail: qa('alumno1').toUpperCase().replace('@COLEGIO', '@colegio'),
      }).expect(200);
      expect(res.body.institutionalEmail).toBe(qa('alumno1'));
      expect(auditOf('users.user.update', s1.user.id)).toHaveLength(before);
    });

    it('RF-22: cambia el correo (200) y registra changedFields con ambos campos', async () => {
      const res = await patch('admin', `/users/${s1.user.id}`, {
        institutionalEmail: qa('alumno1b'),
        fullName: 'QA F3 Alumno Uno Dos',
      }).expect(200);
      expect(res.body.institutionalEmail).toBe(qa('alumno1b'));
      const logs = auditOf('users.user.update', s1.user.id);
      expect(logs).toHaveLength(2);
      expect((logs[1]!.afterState as Json).changedFields.sort()).toEqual([
        'fullName',
        'institutionalEmail',
      ]);
      expect(JSON.stringify(logs[1])).not.toContain('alumno1b');
    });

    it('RF-22: correo ya usado 409 (el del admin del seed), dominio ajeno 422', async () => {
      await patch('admin', `/users/${s1.user.id}`, {
        institutionalEmail: `admin@${DOMAIN}`,
      }).expect(409);
      await patch('admin', `/users/${s1.user.id}`, {
        institutionalEmail: 'qa-f3-alumno1@otro.example',
      }).expect(422);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: s1.user.id } });
      expect(row.institutionalEmail).toBe(qa('alumno1b'));
    });

    it('RF-22/D-012: el rol no se edita (400), cuerpo vacio 400, id invalido 400, inexistente 404', async () => {
      await patch('admin', `/users/${s1.user.id}`, { role: 'ADMIN' }).expect(400);
      await patch('admin', `/users/${s1.user.id}`, {
        fullName: 'QA F3 Otro',
        role: 'ADMIN',
      }).expect(400);
      await patch('admin', `/users/${s1.user.id}`, { status: 'INACTIVE' }).expect(400);
      await patch('admin', `/users/${s1.user.id}`, {}).expect(400);
      await patch('admin', `/users/${s1.user.id}`, { fullName: 'ab' }).expect(400);
      await patch('admin', '/users/no-uuid', { fullName: 'QA F3 Otro' }).expect(400);
      await patch('admin', `/users/${randomUUID()}`, { fullName: 'QA F3 Otro' }).expect(404);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: s1.user.id } });
      expect(row.role).toBe('STUDENT');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Privacidad de la bitacora y de los eventos (RNF-09, RNF-11, D-024)', () => {
    it('RNF-09: ningun registro del modulo users contiene correos ni nombres', () => {
      const records = sink.records.filter((r) => r.module === 'users');
      expect(records.length).toBeGreaterThan(10);
      for (const r of records) {
        const text = JSON.stringify(r);
        expect(text, r.action).not.toMatch(/@/);
        expect(text, r.action).not.toMatch(/QA F3/i);
        expect(r.actorId).toBeDefined();
        expect(r.action.startsWith('users.')).toBe(true);
      }
    });

    it('RNF-09: los eventos del modulo users llevan solo ids, roles y estados', () => {
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(JSON.stringify(e.payload), e.type).not.toMatch(/@|QA F3/i);
      }
    });

    it('RNF-09: las respuestas de error no revelan el correo enviado', async () => {
      const res = await post('admin', '/teachers', {
        institutionalEmail: qa('profe1'),
        fullName: 'QA F3 Profe Uno',
      }).expect(409);
      expect(JSON.stringify(res.body)).not.toContain('profe1');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Limpieza y linea base', () => {
    it('RF-18..25: tras limpiar los datos QA, los conteos vuelven a la linea base del seed', async () => {
      await cleanQaData();
      const now = await counts();
      expect(now).toEqual(baseline);
      expect(now).toMatchObject({
        years: 2,
        periods: 8,
        sections: 7,
        courses: 5,
        courseSections: 30,
        users: 68,
        enrollments: 62,
        currentEnrollments: 59,
        links: 3,
        activeLinks: 3,
      });
      expect(
        await prisma.user.count({ where: { institutionalEmail: { startsWith: 'qa-' } } }),
      ).toBe(0);
      expect(await prisma.academicYear.count({ where: { year: { gte: 2090 } } })).toBe(0);
    });
  });
});
