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

// Fase 5e de Dev 5 (RF-54): calendario de plazos con MySQL real y el seed (solo local). Tareas en
// enero de 2030 (fuera de los datos del seed) en 3.° A Ciencia (docente03), 3.° A Matemática
// (docente01) y 3.° B Ciencia (docente03). apoderado01 tiene a estudiante01 (3.° A) y a
// estudiante11 (3.° B); apoderado02 a estudiante02 (3.° A). Se borran al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const PREFIX = 'QA-5E ';
const MAX_PREFIX = 'QA-5E-MAX '; // tareas del tope de 500 (enero de 2031)
const SECRET_INSTRUCTIONS = 'Instrucciones privadas QA-5E';
const FROM = '2030-01-01';
const TO = '2030-02-01'; // excluido: 2030-02-01T05:00:00Z

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Item = { title: string; students?: { id: string; fullName: string }[] } & Record<
  string,
  unknown
>;

describe.skipIf(!process.env.DATABASE_URL)('Calendario 5e (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  const cs = new Map<string, string>();
  let periodId: string;

  const http = () => request(app.getHttpServer());
  const cal = (key: string | null, qs: string) => {
    const req = http().get(`${API}/me/calendar?${qs}`);
    return key ? req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`) : req;
  };
  const range = `from=${FROM}&to=${TO}`;
  /** Solo las tareas de esta prueba, por título. */
  const titles = (items: Item[]) =>
    items
      .filter((i) => i.title.startsWith(PREFIX))
      .map((i) => i.title.slice(PREFIX.length))
      .sort();

  const make = (key: string, title: string, dueAt: string, deleted = false) =>
    prisma.assignment.create({
      data: {
        courseSectionId: cs.get(key)!,
        periodId,
        title: PREFIX + title,
        instructions: SECRET_INSTRUCTIONS,
        dueAt: new Date(dueAt),
        createdById: ids.get(key.startsWith('3A-MAT') ? 'docente01' : 'docente03')!,
        deletedAt: deleted ? new Date() : null,
      },
    });

  const clean = async () => {
    await prisma.assignment.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await prisma.assignment.deleteMany({ where: { title: { startsWith: MAX_PREFIX } } });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    periodId = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, sequence: 4 },
      })
    ).id;
    const find = (course: string, code: string) =>
      prisma.courseSection.findFirstOrThrow({
        where: {
          course: { name: course },
          section: { academicYearId: y2026.id, gradeLevel: 3, code },
        },
      });
    cs.set('3A-CIE', (await find('Ciencia y Tecnología', 'A')).id);
    cs.set('3A-MAT', (await find('Matemática', 'A')).id);
    cs.set('3B-CIE', (await find('Ciencia y Tecnología', 'B')).id);

    for (const key of [
      'admin',
      'docente01',
      'docente03',
      'estudiante01',
      'estudiante02',
      'estudiante03',
      'estudiante11',
      'estudiante59',
      'apoderado01',
      'apoderado02',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    await clean();
    await make('3A-CIE', 'A1', '2030-01-10T15:00:00Z');
    await make('3A-MAT', 'A2', '2030-01-20T15:00:00Z');
    await make('3B-CIE', 'B1', '2030-01-15T15:00:00Z');
    await make('3A-CIE', 'borrada', '2030-01-12T15:00:00Z', true);
    await make('3A-CIE', 'fuera', '2030-03-20T15:00:00Z');
    await make('3A-CIE', 'borde', '2030-02-01T05:00:00Z'); // = to: excluida
    await make('3A-CIE', 'inicio', '2030-01-01T05:00:00Z'); // = from: incluida

    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const [key, id] of ids) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      cookies.set(key, await sessions.create({ id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await app?.close();
      await prisma?.$disconnect();
    }
  });

  it('TEACHER: solo sus cursos-sección; sin borradas ni fuera de rango; from incluido, to excluido', async () => {
    const t3 = await cal('docente03', range).expect(200);
    expect(titles(t3.body.items)).toEqual(['A1', 'B1', 'inicio']);
    expect(t3.body).toMatchObject({
      from: '2030-01-01T05:00:00.000Z',
      to: '2030-02-01T05:00:00.000Z',
      truncated: false,
    });
    const t1 = await cal('docente01', range).expect(200);
    expect(titles(t1.body.items)).toEqual(['A2']);
  });

  it('STUDENT: los cursos de su sección vigente, ordenados por plazo', async () => {
    const s1 = await cal('estudiante01', range).expect(200);
    const mine = (s1.body.items as Item[]).filter((i) => i.title.startsWith(PREFIX));
    expect(mine.map((i) => i.title.slice(PREFIX.length))).toEqual(['inicio', 'A1', 'A2']);
    expect(mine[1]).toEqual({
      assignmentId: expect.any(String),
      title: `${PREFIX}A1`,
      dueAt: '2030-01-10T15:00:00.000Z',
      allowLate: false,
      courseSectionId: cs.get('3A-CIE'),
      course: { id: expect.any(String), name: 'Ciencia y Tecnología' },
      section: { id: expect.any(String), gradeLevel: 3, code: 'A' },
    });
    const s11 = await cal('estudiante11', range).expect(200);
    expect(titles(s11.body.items)).toEqual(['B1']);
  });

  it('GUARDIAN: plazos de sus estudiantes vinculados y a quién corresponde cada uno', async () => {
    const g1 = await cal('apoderado01', range).expect(200);
    const items = (g1.body.items as Item[]).filter((i) => i.title.startsWith(PREFIX));
    expect(titles(items)).toEqual(['A1', 'A2', 'B1', 'inicio']);
    const b1 = items.find((i) => i.title === `${PREFIX}B1`)!;
    expect(b1.students!.map((s) => s.id)).toEqual([ids.get('estudiante11')]);
    const a1 = items.find((i) => i.title === `${PREFIX}A1`)!;
    expect(a1.students!.map((s) => s.id)).toEqual([ids.get('estudiante01')]);

    const g2 = await cal('apoderado02', range).expect(200);
    expect(titles(g2.body.items)).toEqual(['A1', 'A2', 'inicio']);
  });

  it('GUARDIAN con ?studentId: solo ese estudiante; 403 si no está vinculado', async () => {
    const only = await cal('apoderado01', `${range}&studentId=${ids.get('estudiante11')}`).expect(
      200,
    );
    expect(titles(only.body.items)).toEqual(['B1']);
    const denied = await cal('apoderado01', `${range}&studentId=${ids.get('estudiante02')}`);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain(PREFIX);
  });

  it('nunca expone instrucciones', async () => {
    for (const who of ['docente03', 'estudiante01', 'apoderado01']) {
      const res = await cal(who, range).expect(200);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_INSTRUCTIONS);
      expect(res.body.items[0]).not.toHaveProperty('instructions');
    }
  });

  it('ADMIN 403, sin sesión 401', async () => {
    await cal('admin', range).expect(403);
    await cal(null, range).expect(401);
  });

  it('validación: rango de más de 62 días, to <= from, fechas mal formadas, studentId de un estudiante → 400', async () => {
    const long = await cal('docente03', 'from=2030-01-01&to=2030-03-05');
    expect(long.status).toBe(400);
    expect(long.body.error.details[0].path).toBe('to');
    await cal('docente03', 'from=2030-01-01&to=2030-03-04').expect(200); // 62 días exactos
    await cal('docente03', 'from=2030-02-01&to=2030-01-01').expect(400);
    await cal('docente03', 'from=ayer&to=2030-01-01').expect(400);
    await cal('docente03', `from=${FROM}&from=${FROM}&to=${TO}`).expect(400);
    await cal('docente03', 'to=2030-01-01').expect(400);
    await cal('estudiante01', `${range}&studentId=${ids.get('estudiante02')}`).expect(400);
    await cal('apoderado01', `${range}&studentId=no-es-uuid`).expect(400);
  });

  it('acepta instantes con zona como los manda FullCalendar', async () => {
    const res = await cal(
      'docente03',
      `from=${encodeURIComponent('2030-01-10T00:00:00-05:00')}&to=${encodeURIComponent('2030-01-11T00:00:00-05:00')}`,
    ).expect(200);
    expect(titles(res.body.items)).toEqual(['A1']);
  });

  it('RF-54: from igual a to → 400; 62 días justos con hora → 200 y 62 días + 1 ms → 400', async () => {
    const enc = encodeURIComponent;
    await cal('docente03', 'from=2030-01-01&to=2030-01-01').expect(400);
    const eq = '2030-01-10T00:00:00-05:00';
    await cal('docente03', `from=${enc(eq)}&to=${enc(eq)}`).expect(400);
    const from = '2030-01-01T00:00:00.000Z';
    await cal('docente03', `from=${enc(from)}&to=${enc('2030-03-04T00:00:00.000Z')}`).expect(200);
    const long = await cal('docente03', `from=${enc(from)}&to=${enc('2030-03-04T00:00:00.001Z')}`);
    expect(long.status).toBe(400);
    expect(long.body.error.details[0].path).toBe('to');
  });

  it('RF-54: un docente que manda studentId → 400 (solo el apoderado puede)', async () => {
    const res = await cal('docente03', `${range}&studentId=${ids.get('estudiante01')}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('studentId');
  });

  it('RN-14: con matrícula no vigente en 3.° A (traslado a 3.° B), solo ve los plazos de su sección actual', async () => {
    const mine = await prisma.enrollment.findMany({
      where: { studentId: ids.get('estudiante03'), section: { academicYear: { year: 2026 } } },
      select: { isCurrent: true, section: { select: { code: true } } },
    });
    expect(mine.filter((e) => e.isCurrent).map((e) => e.section.code)).toEqual(['B']);
    expect(mine.some((e) => !e.isCurrent && e.section.code === 'A')).toBe(true);
    const res = await cal('estudiante03', range).expect(200);
    expect(titles(res.body.items)).toEqual(['B1']);
  });

  it('un usuario que ya no está ACTIVE recibe 403 aunque tenga sesión', async () => {
    const res = await cal('estudiante59', range);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(PREFIX);
  });

  describe('tope de 500 plazos (truncated)', () => {
    const MAX_RANGE = 'from=2031-01-01&to=2031-02-01';
    const bulk = (count: number, offset = 0) =>
      prisma.assignment.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          courseSectionId: cs.get('3A-CIE')!,
          periodId,
          title: `${MAX_PREFIX}${String(offset + i).padStart(3, '0')}`,
          instructions: SECRET_INSTRUCTIONS,
          // un plazo distinto por tarea, dentro del mes (orden estable por dueAt)
          dueAt: new Date(Date.UTC(2031, 0, 2) + (offset + i) * 60_000),
          createdById: ids.get('docente03')!,
        })),
      });
    const mineMax = (items: Item[]) => items.filter((i) => i.title.startsWith(MAX_PREFIX));

    it('exactamente 500 → truncated false; 501 → 500 elementos, los primeros por plazo y truncated true', async () => {
      await bulk(500);
      const exact = await cal('estudiante01', MAX_RANGE).expect(200);
      expect(exact.body.items).toHaveLength(500);
      expect(exact.body.truncated).toBe(false);

      await bulk(1, 500);
      for (const who of ['estudiante01', 'docente03', 'apoderado01']) {
        const res = await cal(who, MAX_RANGE).expect(200);
        expect(res.body.items).toHaveLength(500);
        expect(res.body.truncated).toBe(true);
        const titlesOut = mineMax(res.body.items).map((i) => i.title);
        expect(titlesOut[0]).toBe(`${MAX_PREFIX}000`);
        expect(titlesOut[499]).toBe(`${MAX_PREFIX}499`);
        expect(titlesOut).not.toContain(`${MAX_PREFIX}500`);
      }
      // Quien no pertenece a 3.° A no recibe nada de esto.
      const other = await cal('estudiante11', MAX_RANGE).expect(200);
      expect(other.body).toMatchObject({ items: [], truncated: false });
    });
  });
});
