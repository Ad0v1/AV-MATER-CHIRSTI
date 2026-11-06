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

// Fase 5f (RF-58, RF-60): el limitador REAL de los reportes (sin espiar ThrottlerStorage), en un
// archivo aparte para no mezclarlo con los casos que piden más de 10 exportaciones. Solo local
// con MySQL (usuarios del seed). Las peticiones de 400/404 también cuentan: el guard va antes
// que el pipe, y así no se encola nada ni se llega a JOB_LIMIT.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const NO_YEAR = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!process.env.DATABASE_URL)('Reportes 5f: throttle real (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const cookies = new Map<string, string>();

  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as never }));
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('RF-58: POST /admin/exports responde 429 THROTTLED a la petición 11 del minuto (no JOB_LIMIT)', async () => {
    const send = () =>
      http().post(`${API}/admin/exports`).set('Cookie', as('admin')).send({ type: 'YEAR_BACKUP' });
    for (let i = 0; i < 10; i++) await send().expect(400);
    const res = await send().expect(429);
    expect(res.body?.error?.code).not.toBe('JOB_LIMIT');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('RF-60: GET /admin/reports/dashboard responde 429 a la petición 6 del minuto', async () => {
    const send = () =>
      http()
        .get(`${API}/admin/reports/dashboard?academicYearId=${NO_YEAR}&periodId=${NO_YEAR}`)
        .set('Cookie', as('admin'));
    for (let i = 0; i < 5; i++) await send().expect(404);
    await send().expect(429);
  });

  it('RF-57: el listado de cursos-sección no usa el límite estricto de exportaciones', async () => {
    // El admin ya agotó exportaciones y dashboard; el listado sigue respondiendo.
    await http()
      .get(`${API}/admin/reports/course-sections?academicYearId=${NO_YEAR}`)
      .set('Cookie', as('admin'))
      .expect(404);
  });

  it('RF-58: el límite es por usuario: otro usuario no queda bloqueado por el ADMIN agotado', async () => {
    await http()
      .post(`${API}/admin/exports`)
      .set('Cookie', as('docente01'))
      .send({ type: 'YEAR_BACKUP' })
      .expect(403);
  });
});
