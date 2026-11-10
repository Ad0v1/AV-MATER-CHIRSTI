import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { QueueService } from './../src/modules/queue/index.js';
import { createDbTestApp } from './helpers.js';

// Fase 5d de Dev 5 (RF-32): anuncios con MySQL real y el seed (solo local). docente01 enseña
// Matemática en 3.° A; docente03 Ciencia en 3.° A y 3.° B. apoderado01 tiene a estudiante01 (3.° A)
// y a estudiante11 (3.° B). Redis no se usa: se espía QueueService.enqueue. Se borra al final.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const PREFIX = 'QA-5D-AN ';

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Item = {
  id: string;
  title: string;
  scope: string;
  canEdit: boolean;
  students?: { id: string }[];
};

describe.skipIf(!process.env.DATABASE_URL)('Anuncios 5d (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let enqueue: ReturnType<typeof vi.spyOn>;
  const cookies = new Map<string, string>();
  const ids = new Map<string, string>();
  const cs = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const as = (key: string | null, req: request.Test) =>
    key ? req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`) : req;
  const get = (key: string | null, path: string) => as(key, http().get(`${API}${path}`));
  const post = (key: string | null, path: string, body: object) =>
    as(key, http().post(`${API}${path}`).send(body));
  const patch = (key: string | null, path: string, body: object) =>
    as(key, http().patch(`${API}${path}`).send(body));
  const del = (key: string | null, path: string) => as(key, http().delete(`${API}${path}`));
  const titles = (items: Item[]) =>
    items
      .filter((i) => i.title.startsWith(PREFIX))
      .map((i) => i.title.slice(PREFIX.length))
      .sort();
  const mine = async (key: string, qs = '') => {
    const res = await get(key, `/me/announcements${qs}`).expect(200);
    return res.body.items as Item[];
  };

  const clean = () => prisma.announcement.deleteMany({ where: { title: { startsWith: PREFIX } } });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
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
      'estudiante11',
      'estudiante61',
      'apoderado01',
      'apoderado03',
    ]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
    }
    await clean();
    app = await createDbTestApp();
    enqueue = vi
      .spyOn(app.get(QueueService), 'enqueue')
      .mockImplementation((_q, _n, _d, o) => Promise.resolve(o?.jobId ?? ''));
    const sessions = app.get(SessionService);
    for (const [key, id] of ids) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      cookies.set(key, await sessions.create({ id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      if (prisma) await clean();
    } finally {
      await app?.close();
      await prisma?.$disconnect();
    }
  });

  it('TEACHER asignado publica en su curso; encola el aviso con solo el id', async () => {
    enqueue.mockClear();
    const res = await post('docente03', `/course-sections/${cs.get('3A-CIE')}/announcements`, {
      title: `${PREFIX}cie-3a`,
      body: 'Traer\r\nlaboratorio',
    }).expect(201);
    expect(res.body).toMatchObject({
      scope: 'COURSE_SECTION',
      courseSectionId: cs.get('3A-CIE'),
      body: 'Traer\nlaboratorio',
      canEdit: true,
      edited: false,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'announcement-published',
      { announcementId: res.body.id },
      { jobId: `announcement-published-${res.body.id}` },
    );
  });

  it('TEACHER no asignado → 403; ADMIN publica en cualquier curso; validación 400', async () => {
    await post('docente01', `/course-sections/${cs.get('3B-CIE')}/announcements`, {
      title: `${PREFIX}x`,
      body: 'y',
    }).expect(403);
    await post('admin', `/course-sections/${cs.get('3B-CIE')}/announcements`, {
      title: `${PREFIX}cie-3b`,
      body: 'Aviso del admin',
    }).expect(201);
    await post('docente03', `/course-sections/${cs.get('3A-CIE')}/announcements`, {
      title: `${PREFIX}a\nb`,
      body: 'y',
    }).expect(400);
    await post('docente03', `/course-sections/${cs.get('3A-CIE')}/announcements`, {
      title: `${PREFIX}x`,
      body: 'y',
      scope: 'INSTITUTION',
    }).expect(400);
    await post('estudiante01', `/course-sections/${cs.get('3A-CIE')}/announcements`, {
      title: `${PREFIX}x`,
      body: 'y',
    }).expect(403);
  });

  it('INSTITUTION y GRADE solo ADMIN', async () => {
    await post('admin', '/announcements', {
      scope: 'INSTITUTION',
      title: `${PREFIX}inst`,
      body: 'Para todos',
    }).expect(201);
    await post('admin', '/announcements', {
      scope: 'GRADE',
      level: 'SECUNDARIA',
      gradeLevel: 3,
      title: `${PREFIX}g3`,
      body: 'Tercero',
    }).expect(201);
    await post('admin', '/announcements', {
      scope: 'GRADE',
      level: 'SECUNDARIA',
      gradeLevel: 4,
      title: `${PREFIX}g4`,
      body: 'Cuarto',
    }).expect(201);
    await post('docente03', '/announcements', {
      scope: 'INSTITUTION',
      title: `${PREFIX}x`,
      body: 'y',
    }).expect(403);
    await post('admin', '/announcements', {
      scope: 'GRADE',
      level: 'SECUNDARIA',
      gradeLevel: 9,
      title: `${PREFIX}x`,
      body: 'y',
    }).expect(400);
    // Sin nivel → 400 (nunca 500 por el CHECK). El grado por nivel se prueba en el DTO.
    // Tope de 5 POST por minuto (ANNOUNCEMENT_CREATE_THROTTLE): no agregar más aquí.
    await post('admin', '/announcements', {
      scope: 'GRADE',
      gradeLevel: 3,
      title: `${PREFIX}x`,
      body: 'y',
    }).expect(400);
    const list = await get('admin', '/announcements').expect(200);
    expect(titles(list.body.items)).toEqual(['g3', 'g4', 'inst']);
    expect(list.body.items.find((i: Item) => i.title === `${PREFIX}g3`)).toMatchObject({
      level: 'SECUNDARIA',
      gradeLevel: 3,
    });
    await get('docente03', '/announcements').expect(403);
  });

  it('GET /me/announcements: cada rol ve su alcance', async () => {
    expect(titles(await mine('estudiante01'))).toEqual(['cie-3a', 'g3', 'inst']);
    expect(titles(await mine('estudiante11'))).toEqual(['cie-3b', 'g3', 'inst']);
    // los docentes del seed también enseñan en 4.°: ven g4, pero no los anuncios de cursos ajenos.
    expect(titles(await mine('docente01'))).toEqual(['g3', 'g4', 'inst']);
    expect(titles(await mine('docente03'))).toEqual(['cie-3a', 'cie-3b', 'g3', 'g4', 'inst']);
    await get('admin', '/me/announcements').expect(403);
    await get(null, '/me/announcements').expect(401);
  });

  it('GUARDIAN: anuncios de sus estudiantes y a quién alcanza; ?studentId solo vinculado', async () => {
    const all = await mine('apoderado01');
    expect(titles(all)).toEqual(['cie-3a', 'cie-3b', 'g3', 'inst']);
    const cie3b = all.find((i) => i.title === `${PREFIX}cie-3b`)!;
    expect(cie3b.students!.map((s) => s.id)).toEqual([ids.get('estudiante11')]);
    expect(all.every((i) => i.canEdit === false)).toBe(true);
    const only = await mine('apoderado01', `?studentId=${ids.get('estudiante01')}`);
    expect(titles(only)).toEqual(['cie-3a', 'g3', 'inst']);
    await get('apoderado01', `/me/announcements?studentId=${ids.get('estudiante02')}`).expect(403);
    await get('estudiante01', `/me/announcements?studentId=${ids.get('estudiante01')}`).expect(400);
  });

  it('tres niveles: GRADE compara (nivel, grado); 4.° primaria no ve 4.° secundaria', async () => {
    // Se crean directo en BD: el POST ya se probó arriba y tiene tope de 5 por minuto.
    const year = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const make = (level: 'PRIMARIA' | 'INICIAL', gradeLevel: number, t: string) =>
      prisma.announcement.create({
        data: {
          academicYearId: year.id,
          scope: 'GRADE',
          level,
          gradeLevel,
          title: `${PREFIX}${t}`,
          body: 'Por nivel',
          authorId: ids.get('admin')!,
        },
      });
    await make('PRIMARIA', 4, 'p4');
    await make('INICIAL', 5, 'i5');
    try {
      // estudiante61 está en P4C: ve p4, no g4 (4.° secundaria) ni i5.
      expect(titles(await mine('estudiante61'))).toEqual(['inst', 'p4']);
      // estudiante01 (3.° secundaria) no ve los anuncios de primaria ni de inicial.
      expect(titles(await mine('estudiante01'))).toEqual(['cie-3a', 'g3', 'inst']);
      // apoderado03 solo tiene niños de inicial (sin cuenta): ve los anuncios de 5 años.
      const inicial = await mine('apoderado03');
      expect(titles(inicial)).toEqual(['i5', 'inst']);
      expect(inicial.find((i) => i.title === `${PREFIX}i5`)!.students!.length).toBe(2);
    } finally {
      await prisma.announcement.deleteMany({
        where: { title: { in: [`${PREFIX}p4`, `${PREFIX}i5`] } },
      });
    }
  });

  it('PATCH: autor o ADMIN; no vuelve a encolar; edited true', async () => {
    const own = (await mine('docente03')).find((i) => i.title === `${PREFIX}cie-3a`)!;
    enqueue.mockClear();
    const res = await patch('docente03', `/announcements/${own.id}`, {
      body: 'Cuerpo corregido',
    }).expect(200);
    expect(res.body.body).toBe('Cuerpo corregido');
    expect(enqueue).not.toHaveBeenCalled();
    await prisma.announcement.update({
      where: { id: own.id },
      data: { publishedAt: new Date(Date.now() - 60_000) },
    });
    const again = await patch('admin', `/announcements/${own.id}`, {
      title: `${PREFIX}cie-3a`,
      body: 'Del admin',
    }).expect(200);
    expect(again.body.edited).toBe(true);
    await patch('docente01', `/announcements/${own.id}`, { body: 'x' }).expect(403);
    await patch('docente03', `/announcements/${own.id}`, {}).expect(400);
    // El docente no edita anuncios institucionales aunque los vea.
    const inst = (await mine('docente03')).find((i) => i.title === `${PREFIX}inst`)!;
    expect(inst.canEdit).toBe(false);
    await patch('docente03', `/announcements/${inst.id}`, { body: 'x' }).expect(403);
  });

  it('DELETE lógico: desaparece de las listas, la fila queda con deletedAt; 404 al repetir', async () => {
    const g4 = (await get('admin', '/announcements').expect(200)).body.items.find(
      (i: Item) => i.title === `${PREFIX}g4`,
    ) as Item;
    await del('docente03', `/announcements/${g4.id}`).expect(403);
    await del('admin', `/announcements/${g4.id}`).expect(204);
    await del('admin', `/announcements/${g4.id}`).expect(404);
    const row = await prisma.announcement.findUniqueOrThrow({ where: { id: g4.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).toBe(ids.get('admin'));
    const list = await get('admin', '/announcements').expect(200);
    expect(titles(list.body.items)).toEqual(['g3', 'inst']);
    await patch('admin', `/announcements/${g4.id}`, { body: 'x' }).expect(404);
  });

  it('GET por curso-sección: docente asignado o ADMIN', async () => {
    const res = await get('docente03', `/course-sections/${cs.get('3A-CIE')}/announcements`).expect(
      200,
    );
    expect(titles(res.body.items)).toEqual(['cie-3a']);
    await get('docente01', `/course-sections/${cs.get('3A-CIE')}/announcements`).expect(403);
    await get('admin', `/course-sections/${cs.get('3A-CIE')}/announcements`).expect(200);
    await get('estudiante01', `/course-sections/${cs.get('3A-CIE')}/announcements`).expect(403);
  });

  it('INFORME 17: 50 anuncios de curso del mismo autor en 24 h → 429 ANNOUNCEMENT_LIMIT', async () => {
    const y = await prisma.courseSection.findUniqueOrThrow({
      where: { id: cs.get('3A-MAT')! },
      select: { section: { select: { academicYearId: true } } },
    });
    await prisma.announcement.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        academicYearId: y.section.academicYearId,
        scope: 'COURSE_SECTION' as const,
        courseSectionId: cs.get('3A-MAT')!,
        title: `${PREFIX}tope ${i}`,
        body: 'x',
        authorId: ids.get('docente01')!,
      })),
    });
    const res = await post('docente01', `/course-sections/${cs.get('3A-MAT')}/announcements`, {
      title: `${PREFIX}uno más`,
      body: 'y',
    }).expect(429);
    expect(res.body.error.code).toBe('ANNOUNCEMENT_LIMIT');
  });
});
