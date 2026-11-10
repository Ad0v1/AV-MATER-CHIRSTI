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
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// RF-16 / RN-15 (F6, entrega 6b): promoción en bloque. Usa MySQL real con el seed cargado (solo
// local con Docker) y deja la BD como estaba: borra sus años, matrículas y usuarios QA.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const USER_PREFIX = 'qa-f6p-';
// 2070 → 2071: origen y destino. 2072: no consecutivo. 2016 → 2017: destino de solo lectura.
const QA_YEARS = [2016, 2017, 2070, 2071, 2072, 2080, 2081];

const periodsOf = (year: number) => [
  { sequence: 1, startDate: `${year}-03-01`, endDate: `${year}-05-31` },
  { sequence: 2, startDate: `${year}-06-01`, endDate: `${year}-08-31` },
  { sequence: 3, startDate: `${year}-09-01`, endDate: `${year}-11-30` },
  { sequence: 4, startDate: `${year}-12-01`, endDate: `${year}-12-20` },
];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sorted = (xs: readonly unknown[]): string[] =>
  xs.map(String).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

type Decision = { enrollmentId: string; action: string; sectionId?: string };

describe.skipIf(!process.env.DATABASE_URL)('Promoción en bloque RF-16 (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let sink: MemoryAuditSink;
  let baseline: Record<string, number>;

  const cookies = new Map<string, string>();
  const years = new Map<number, string>();
  const sections = new Map<string, string>(); // '2070-1A' -> id
  const students = new Map<string, string>(); // 's1' -> id
  const enrollments = new Map<string, string>(); // 's1' -> matrícula vigente en 2070

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const proposal = (key: string, targetId: string, sourceYearId?: string) =>
    http()
      .get(
        `${API}/academic-years/${targetId}/promotion-proposal${sourceYearId ? `?sourceYearId=${sourceYearId}` : ''}`,
      )
      .set('Cookie', as(key));
  const commit = (key: string, targetId: string, body: object) =>
    http().post(`${API}/academic-years/${targetId}/promotion`).set('Cookie', as(key)).send(body);
  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);

  const counts = async () => ({
    years: await prisma.academicYear.count(),
    periods: await prisma.academicPeriod.count(),
    sections: await prisma.section.count(),
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
    await prisma.enrollment.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await prisma.enrollment.deleteMany({
      where: { student: { email: { startsWith: USER_PREFIX } } },
    });
    await prisma.section.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: { in: yearIds } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: USER_PREFIX } } });
  };

  const y = (year: number) => years.get(year)!;
  const sec = (key: string) => sections.get(key)!;
  const P = () => ({ target: y(2071), source: y(2070) });

  /** Decisiones que aceptan la propuesta tal cual. */
  const accept = (items: Json[]): Decision[] =>
    items.map((i) => ({
      enrollmentId: i.enrollmentId,
      action: i.proposed.action,
      ...(i.proposed.sectionId ? { sectionId: i.proposed.sectionId } : {}),
    }));

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    await cleanQaData(); // por si una corrida anterior se interrumpió
    baseline = await counts();

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role }));
    }
    const inactiveAdmin = await prisma.user.create({
      data: {
        email: `${USER_PREFIX}admin@colegio.example`,
        fullName: 'QA Admin Inactivo',
        role: 'ADMIN',
        status: 'INACTIVE',
      },
    });
    cookies.set('adminInactivo', await sessions.create({ id: inactiveAdmin.id, role: 'ADMIN' }));

    for (const year of QA_YEARS) {
      const res = await http()
        .post(`${API}/academic-years`)
        .set('Cookie', as('admin'))
        .send({ year, periods: periodsOf(year) })
        .expect(201);
      years.set(year, res.body.id as string);
    }
    // Períodos de los orígenes cerrados.
    await prisma.academicPeriod.updateMany({
      where: { academicYearId: { in: [y(2070), y(2016)] } },
      data: { closedAt: new Date() },
    });

    const mkSection = async (year: number, gradeLevel: number, code: string) => {
      const s = await prisma.section.create({
        data: { academicYearId: y(year), gradeLevel, code },
      });
      sections.set(`${year}-${gradeLevel}${code}`, s.id);
    };
    for (const [g, c] of [
      [1, 'A'],
      [2, 'A'],
      [5, 'A'],
    ] as const)
      await mkSection(2070, g, c);
    for (const [g, c] of [
      [1, 'A'],
      [2, 'A'],
      [3, 'A'],
    ] as const)
      await mkSection(2071, g, c);
    await mkSection(2072, 1, 'A');
    await mkSection(2016, 1, 'A');
    await mkSection(2017, 2, 'A');

    // s1, s2, s6 en 1A; s3, s5 en 2A; s4 en 5A. s5 INACTIVE, s6 WITHDRAWN con matrícula vigente,
    // s7 retirado con la matrícula cerrada (no entra en la propuesta).
    const fixtures: [string, string, 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN', string, boolean][] = [
      ['s1', 'Alumna Uno', 'ACTIVE', '2070-1A', true],
      ['s2', 'Alumno Dos', 'ACTIVE', '2070-1A', true],
      ['s3', 'Alumna Tres', 'ACTIVE', '2070-2A', true],
      ['s4', 'Alumno Cuatro', 'ACTIVE', '2070-5A', true],
      ['s5', 'Alumna Cinco', 'INACTIVE', '2070-2A', true],
      ['s6', 'Alumno Seis', 'WITHDRAWN', '2070-1A', true],
      ['s7', 'Alumna Siete', 'WITHDRAWN', '2070-1A', false],
    ];
    for (const [key, name, status, sectionKey, current] of fixtures) {
      const user = await prisma.user.create({
        data: {
          email: `${USER_PREFIX}${key}@colegio.example`,
          fullName: `QA ${name}`,
          role: 'STUDENT',
          status,
        },
      });
      students.set(key, user.id);
      const e = await prisma.enrollment.create({
        data: {
          studentId: user.id,
          sectionId: sec(sectionKey),
          academicYearId: y(2070),
          // s5 empieza en el futuro: al cerrarla, effectiveTo = effectiveFrom (max(ahora, inicio)).
          effectiveFrom: new Date(key === 's5' ? '2070-03-01T00:00:00Z' : '2020-03-01T00:00:00Z'),
          ...(current
            ? {}
            : { isCurrent: null, effectiveTo: new Date(), endReason: 'WITHDRAWAL' as const }),
        },
      });
      if (current) enrollments.set(key, e.id);
    }
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
  describe('Acceso, validación y precondiciones', () => {
    it('RF-16: 401 sin sesión; 403 a docente, estudiante y ADMIN inactivo', async () => {
      const { target, source } = P();
      await http()
        .get(`${API}/academic-years/${target}/promotion-proposal?sourceYearId=${source}`)
        .expect(401);
      await http().post(`${API}/academic-years/${target}/promotion`).send({}).expect(401);
      for (const key of ['docente01', 'estudiante01', 'adminInactivo']) {
        expect((await proposal(key, target, source)).status, key).toBe(403);
        expect((await commit(key, target, {})).status, key).toBe(403);
      }
    });

    it('RF-16: 400 por query o cuerpo inválidos', async () => {
      const { target, source } = P();
      expect((await proposal('admin', target)).status).toBe(400);
      expect((await proposal('admin', target, 'x')).status).toBe(400);
      const fp = 'a'.repeat(64);
      const d = { enrollmentId: enrollments.get('s1')!, action: 'EXCLUDE' };
      for (const body of [
        { sourceYearId: source, fingerprint: fp, decisions: [d], extra: 1 },
        { sourceYearId: source, fingerprint: 'abc', decisions: [d] },
        { sourceYearId: source, fingerprint: fp, decisions: [] },
        { sourceYearId: source, fingerprint: fp, decisions: [d, d] },
        { sourceYearId: source, fingerprint: fp, decisions: [{ ...d, action: 'MOVE' }] },
        { sourceYearId: source, fingerprint: fp, decisions: [{ ...d, extra: true }] },
      ]) {
        const res = await commit('admin', target, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('RF-16: 404 destino u origen inexistente; 422 mismo año o no consecutivo', async () => {
      const { target, source } = P();
      expect((await proposal('admin', randomUUID(), source)).status).toBe(404);
      expect((await proposal('admin', target, randomUUID())).status).toBe(404);
      expect((await proposal('admin', target, target)).status).toBe(422);
      const res = await proposal('admin', y(2072), source);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe(
        'El año de destino debe ser el siguiente al año de origen',
      );
    });

    it('RF-16: 422 si el origen tiene un período abierto', async () => {
      const { target, source } = P();
      const period = await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: source, sequence: 4 },
      });
      await prisma.academicPeriod.update({ where: { id: period.id }, data: { closedAt: null } });
      try {
        const res = await proposal('admin', target, source);
        expect(res.status).toBe(422);
        expect(res.body.error.message).toMatch(/Cierra todos los períodos/);
      } finally {
        await prisma.academicPeriod.update({
          where: { id: period.id },
          data: { closedAt: new Date() },
        });
      }
    });

    it('RF-16: 422 si el destino no tiene secciones activas', async () => {
      const { target, source } = P();
      await prisma.section.updateMany({
        where: { academicYearId: target },
        data: { isActive: false },
      });
      try {
        const res = await proposal('admin', target, source);
        expect(res.status).toBe(422);
        expect(res.body.error.message).toBe('El año de destino no tiene secciones activas');
      } finally {
        await prisma.section.updateMany({
          where: { academicYearId: target },
          data: { isActive: true },
        });
      }
    });

    it('RF-16/D-030: 409 si el destino es de solo lectura o está cerrado', async () => {
      const readOnly = await proposal('admin', y(2017), y(2016));
      expect(readOnly.status).toBe(409);
      expect(readOnly.body.error.message).toBe('El año de destino es de solo lectura');
      await prisma.academicYear.update({ where: { id: y(2017) }, data: { closedAt: new Date() } });
      const closed = await proposal('admin', y(2017), y(2016));
      expect(closed.status).toBe(409);
      expect(closed.body.error.message).toBe('El año de destino está cerrado');
    });
  });

  // ---------------------------------------------------------------------------
  describe('Propuesta y confirmación', () => {
    let first: Json;

    it('RF-16/RN-15: la propuesta lista las matrículas vigentes con acción, sección y marcas', async () => {
      const { target, source } = P();
      const res = await proposal('admin', target, source);
      expect(res.status).toBe(200);
      first = res.body;
      expect(first).toMatchObject({
        sourceYear: { id: source, year: 2070 },
        targetYear: { id: target, year: 2071 },
        canConfirm: true,
        summary: { promote: 4, repeat: 0, graduate: 1, exclude: 1, withoutSection: 0 },
      });
      expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(first.targetSections).toHaveLength(3);
      const byStudent = new Map((first.items as Json[]).map((i) => [i.studentId, i]));
      expect(byStudent.has(students.get('s7'))).toBe(false); // matrícula cerrada
      expect(first.items).toHaveLength(6);
      expect(byStudent.get(students.get('s1'))).toMatchObject({
        enrollmentId: enrollments.get('s1'),
        status: 'ACTIVE',
        from: { sectionId: sec('2070-1A'), gradeLevel: 1, code: 'A' },
        proposed: { action: 'PROMOTE', sectionId: sec('2071-2A') },
        flags: [],
      });
      expect(byStudent.get(students.get('s4'))!.proposed).toEqual({
        action: 'GRADUATE',
        sectionId: null,
      });
      expect(byStudent.get(students.get('s5'))!.flags).toEqual(['INACTIVE']);
      expect(byStudent.get(students.get('s6'))).toMatchObject({
        proposed: { action: 'EXCLUDE', sectionId: null },
        flags: ['WITHDRAWN'],
      });
      // Orden: grado, código y nombre.
      expect((first.items as Json[]).map((i) => i.from.gradeLevel)).toEqual([1, 1, 1, 2, 2, 5]);
      expect(auditOf('users.promotion.commit')).toHaveLength(0);
    });

    it('RF-16: decisiones incompletas o inválidas → 422 con details y sin escribir', async () => {
      const { target, source } = P();
      const before = await counts();
      const decisions = accept(first.items).map((d) =>
        d.enrollmentId === enrollments.get('s1')
          ? { enrollmentId: d.enrollmentId, action: 'PROMOTE' }
          : d,
      );
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions: decisions.slice(0, -1),
      });
      expect(res.status).toBe(422);
      const paths = (res.body.error.details as Json[]).map((d) => d.path);
      expect(paths).toContain(
        `decisions.${decisions.findIndex((d) => d.enrollmentId === enrollments.get('s1'))}`,
      );
      expect(paths).toContain('decisions');
      expect(await counts()).toEqual(before);
    });

    it('RF-16: decisión que sobra (matrícula ajena a la propuesta) → 422 sin escribir', async () => {
      const { target, source } = P();
      const before = await counts();
      const decisions = [...accept(first.items), { enrollmentId: randomUUID(), action: 'EXCLUDE' }];
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toContainEqual({
        path: `decisions.${decisions.length - 1}`,
        message: 'La matrícula no está en la propuesta',
      });
      expect(await counts()).toEqual(before);
    });

    it('RF-16: decisiones que faltan (solo una de seis) → 422 con el conteo', async () => {
      const { target, source } = P();
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions: accept(first.items).slice(0, 1),
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toContainEqual({
        path: 'decisions',
        message: 'Faltan decisiones para 5 matrículas',
      });
    });

    it('RF-16: sectionId de otro año → 422 sin escribir', async () => {
      const { target, source } = P();
      const before = await counts();
      const decisions = accept(first.items).map((d) =>
        d.enrollmentId === enrollments.get('s1') ? { ...d, sectionId: sec('2070-2A') } : d,
      );
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toContainEqual({
        path: `decisions.${decisions.findIndex((d) => d.enrollmentId === enrollments.get('s1'))}`,
        message: 'La sección de destino no es una sección activa del año',
      });
      expect(await counts()).toEqual(before);
    });

    it('RF-16: sectionId de una sección inactiva del destino → 422 sin escribir', async () => {
      const { target, source } = P();
      await prisma.section.update({ where: { id: sec('2071-2A') }, data: { isActive: false } });
      try {
        const fresh = await proposal('admin', target, source);
        expect(fresh.status).toBe(200);
        expect(fresh.body.targetSections).toHaveLength(2);
        const before = await counts();
        const decisions = accept(fresh.body.items).map((d) =>
          d.enrollmentId === enrollments.get('s1') ? { ...d, sectionId: sec('2071-2A') } : d,
        );
        const res = await commit('admin', target, {
          sourceYearId: source,
          fingerprint: fresh.body.fingerprint,
          decisions,
        });
        expect(res.status).toBe(422);
        expect(res.body.error.details).toContainEqual({
          path: `decisions.${decisions.findIndex((d) => d.enrollmentId === enrollments.get('s1'))}`,
          message: 'La sección de destino no es una sección activa del año',
        });
        expect(await counts()).toEqual(before);
      } finally {
        await prisma.section.update({ where: { id: sec('2071-2A') }, data: { isActive: true } });
      }
    });

    it('RF-16: más de 2000 decisiones → 400 VALIDATION_ERROR', async () => {
      const { target, source } = P();
      const decisions = Array.from({ length: 2001 }, () => ({
        enrollmentId: randomUUID(),
        action: 'EXCLUDE',
      }));
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions,
      });
      // 2001 decisiones superan el límite de cuerpo de Express (100 kb): hoy responde 500 porque
      // ApiExceptionFilter no traduce el error 413 de body-parser (BUG reportado, no del módulo).
      expect([400, 413]).toContain(res.status);
    });

    it('RF-16: huella distinta → 409 sin escribir', async () => {
      const { target, source } = P();
      const before = await counts();
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: '0'.repeat(64),
        decisions: accept(first.items),
      });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toBe('La propuesta cambió; vuelve a cargarla');
      expect(await counts()).toEqual(before);
    });

    it('RF-16/RN-15: primera tanda con correcciones (REPEAT, EXCLUDE) cierra con YEAR_END y crea en el destino', async () => {
      const { target, source } = P();
      const decisions = accept(first.items).map((d) => {
        if (d.enrollmentId === enrollments.get('s2')) {
          return { enrollmentId: d.enrollmentId, action: 'REPEAT', sectionId: sec('2071-1A') };
        }
        if (d.enrollmentId === enrollments.get('s3')) {
          return { enrollmentId: d.enrollmentId, action: 'EXCLUDE' };
        }
        return d;
      });
      const res = await commit('admin', target, {
        sourceYearId: source,
        fingerprint: first.fingerprint,
        decisions,
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        promoted: 2,
        repeated: 1,
        graduated: 1,
        excluded: 2,
        closedEnrollments: 4,
        createdEnrollments: 3,
      });

      for (const key of ['s1', 's2', 's4', 's5']) {
        const closed = await prisma.enrollment.findUniqueOrThrow({
          where: { id: enrollments.get(key)! },
        });
        expect(closed, key).toMatchObject({ isCurrent: null, endReason: 'YEAR_END' });
        expect(closed.effectiveTo, key).not.toBeNull();
      }
      for (const key of ['s3', 's6']) {
        const open = await prisma.enrollment.findUniqueOrThrow({
          where: { id: enrollments.get(key)! },
        });
        expect(open, key).toMatchObject({ isCurrent: true, endReason: null, effectiveTo: null });
      }
      const created = await prisma.enrollment.findMany({
        where: { academicYearId: target, isCurrent: true },
      });
      expect(new Map(created.map((e) => [e.studentId, e.sectionId]))).toEqual(
        new Map([
          [students.get('s1')!, sec('2071-2A')],
          [students.get('s2')!, sec('2071-1A')],
          [students.get('s5')!, sec('2071-3A')],
        ]),
      );
      const s5 = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollments.get('s5')! },
      });
      expect(s5.effectiveTo).toEqual(s5.effectiveFrom);
      // El estado de los usuarios no cambia (s4 egresa sin pasar a INACTIVE).
      const s4 = await prisma.user.findUniqueOrThrow({ where: { id: students.get('s4')! } });
      expect(s4.status).toBe('ACTIVE');

      // Bitácora: una entrada sobre el año destino, solo ids y conteos.
      const audit = auditOf('users.promotion.commit');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        module: 'users',
        entityType: 'AcademicYear',
        entityId: target,
        afterState: {
          sourceYearId: source,
          promoted: 2,
          repeated: 1,
          graduated: 1,
          excluded: 2,
        },
      });
      const after = audit[0].afterState as Json;
      expect(sorted(after.closedEnrollmentIds)).toEqual(
        sorted(['s1', 's2', 's4', 's5'].map((k) => enrollments.get(k))),
      );
      expect(sorted(after.createdEnrollmentIds)).toEqual(sorted(created.map((e) => e.id)));
      expect(JSON.stringify(audit[0])).not.toMatch(/QA |Alumn|@colegio/);
    });

    it('RF-16/D-038: con el origen cerrado, la segunda tanda se propone; en paralelo una 201 y otra 409', async () => {
      const { target, source } = P();
      await prisma.academicYear.update({ where: { id: source }, data: { closedAt: new Date() } });
      const res = await proposal('admin', target, source);
      expect(res.status).toBe(200);
      const items = res.body.items as Json[];
      expect(sorted(items.map((i) => i.studentId))).toEqual(
        sorted([students.get('s3'), students.get('s6')]),
      );
      expect(res.body.fingerprint).not.toBe(first.fingerprint);

      const body = {
        sourceYearId: source,
        fingerprint: res.body.fingerprint,
        decisions: accept(items).map((d) =>
          d.enrollmentId === enrollments.get('s3') ? { ...d, sectionId: sec('2071-3A') } : d,
        ),
      };
      const results = await Promise.all([
        commit('admin', target, body),
        commit('admin', target, body),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      const ok = results.find((r) => r.status === 201)!;
      expect(ok.body).toMatchObject({ promoted: 1, excluded: 1, createdEnrollments: 1 });
      expect(
        await prisma.enrollment.count({
          where: { studentId: students.get('s3')!, academicYearId: target, isCurrent: true },
        }),
      ).toBe(1);
      expect(auditOf('users.promotion.commit')).toHaveLength(1);
    });

    it('RF-16: tras las tandas solo queda el retirado (EXCLUDE); otra propuesta sigue respondiendo 200', async () => {
      const { target, source } = P();
      const res = await proposal('admin', target, source);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        studentId: students.get('s6'),
        proposed: { action: 'EXCLUDE' },
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Promoción entre niveles (tres niveles)', () => {
    type Level = 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA';
    const secs = new Map<string, string>();
    const kids = new Map<string, string>();
    const enr = new Map<string, string>();

    beforeAll(async () => {
      const mk = async (year: number, level: Level, gradeLevel: number) => {
        const sct = await prisma.section.create({
          data: { academicYearId: y(year), level, gradeLevel, code: 'N' },
        });
        secs.set(`${year}-${level}-${gradeLevel}`, sct.id);
      };
      await mk(2080, 'INICIAL', 5);
      await mk(2080, 'PRIMARIA', 6);
      await mk(2081, 'PRIMARIA', 1);
      await mk(2081, 'SECUNDARIA', 1);
      await prisma.academicPeriod.updateMany({
        where: { academicYearId: y(2080) },
        data: { closedAt: new Date() },
      });
      for (const [key, level, grade] of [
        ['n1', 'INICIAL', 5],
        ['n2', 'PRIMARIA', 6],
      ] as const) {
        const u = await prisma.user.create({
          data: {
            email: `${USER_PREFIX}${key}@colegio.example`,
            fullName: `QA Nivel ${key}`,
            role: 'STUDENT',
          },
        });
        kids.set(key, u.id);
        const e = await prisma.enrollment.create({
          data: {
            studentId: u.id,
            sectionId: secs.get(`2080-${level}-${grade}`)!,
            academicYearId: y(2080),
            effectiveFrom: new Date('2020-03-01T00:00:00Z'),
          },
        });
        enr.set(key, e.id);
      }
    });

    it('RF-16: INICIAL 5 años -> PRIMARIA 1.° y PRIMARIA 6.° -> SECUNDARIA 1.° (sin graduar)', async () => {
      const res = await proposal('admin', y(2081), y(2080)).expect(200);
      const byStudent = new Map((res.body.items as Json[]).map((i) => [i.studentId, i]));
      expect(res.body.summary).toMatchObject({ promote: 2, graduate: 0 });
      expect(byStudent.get(kids.get('n1'))!.proposed).toEqual({
        action: 'PROMOTE',
        sectionId: secs.get('2081-PRIMARIA-1'),
      });
      expect(byStudent.get(kids.get('n2'))!.proposed).toEqual({
        action: 'PROMOTE',
        sectionId: secs.get('2081-SECUNDARIA-1'),
      });
      await commit('admin', y(2081), {
        sourceYearId: y(2080),
        fingerprint: res.body.fingerprint,
        decisions: accept(res.body.items),
      }).expect(201);
      const now = await prisma.enrollment.findMany({
        where: { studentId: { in: [...kids.values()] }, isCurrent: true },
        select: { studentId: true, sectionId: true },
      });
      expect(now).toHaveLength(2);
      expect(now.find((e) => e.studentId === kids.get('n1'))!.sectionId).toBe(
        secs.get('2081-PRIMARIA-1'),
      );
      expect(now.find((e) => e.studentId === kids.get('n2'))!.sectionId).toBe(
        secs.get('2081-SECUNDARIA-1'),
      );
    });
  });

  // ---------------------------------------------------------------------------
  it('Limpieza: los conteos del seed no cambian tras borrar los datos QA', async () => {
    await cleanQaData();
    expect(await counts()).toEqual(baseline);
  });
});
