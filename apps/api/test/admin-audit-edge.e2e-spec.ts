import { randomBytes, randomUUID } from 'node:crypto';
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

// Fase 5g de Dev 5, casos límite de la bitácora (RF-62; RF-55/56 con U9) contra MySQL real (solo
// local con Docker). AuditLog es solo inserción: las filas de prueba llevan una acción única
// `qa5g.<aleatorio>` y quedan en la BD local de desarrollo (hasta 51 + 12 filas por corrida).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const DAY = 86_400_000;
type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Item = {
  id: string;
  occurredAt: string;
  action: string;
  module: string;
  supportMode: boolean;
  actor: { id: string; fullName: string; role: Role } | null;
};

describe.skipIf(!process.env.DATABASE_URL)('Bitácora 5g: casos límite (e2e, MySQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  const tag = () => `qa5g.${randomBytes(6).toString('hex')}`;
  const rangeAction = tag();
  const pageAction = tag();
  const supportAction = tag();
  const ipAction = tag();
  // Fecha de referencia redondeada al segundo y dentro de los últimos días.
  const T = new Date(Math.floor((Date.now() - 2 * DAY) / 1000) * 1000);

  const http = () => request(app.getHttpServer());
  const get = (key: string | null, url: string) => {
    const req = http().get(API + url);
    return key ? req.set('Cookie', `${SESSION_COOKIE}=${cookies.get(key)}`) : req;
  };
  const list = (query: string, key = 'admin') => get(key, `/admin/audit-logs?${query}`);
  const iso = (ms: number) => encodeURIComponent(new Date(ms).toISOString());

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    app = await createDbTestApp();
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente01', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }

    // Rango: tres filas con T, T+1 s y T+2 s.
    await prisma.auditLog.createMany({
      data: [0, 1000, 2000].map((offset) => ({
        actorId: ids.get('admin'),
        action: rangeAction,
        module: 'grading',
        occurredAt: new Date(T.getTime() + offset),
      })),
    });
    // Paginación: 51 filas con el mismo instante (el desempate es el id).
    await prisma.auditLog.createMany({
      data: Array.from({ length: 51 }, () => ({
        actorId: ids.get('admin'),
        action: pageAction,
        module: 'users',
        occurredAt: T,
      })),
    });
    // Modo soporte: el mismo actor en distintos módulos, y otros actores en los de soporte.
    const support = (key: string | null, module: string) => ({
      actorId: key ? ids.get(key) : null,
      action: supportAction,
      module,
      entityType: `E-${key ?? 'sistema'}-${module}`,
      occurredAt: T,
    });
    await prisma.auditLog.createMany({
      data: [
        support('admin', 'contents'),
        support('admin', 'submissions'),
        support('admin', 'grading'),
        support('admin', 'users'),
        support('admin', 'files'),
        support('admin', 'auth'),
        support('docente01', 'grading'),
        support('docente01', 'contents'),
        support('estudiante01', 'submissions'),
        support('apoderado01', 'grading'),
        support(null, 'grading'),
      ],
    });
    // IP: un dato personal que la vista no debe devolver.
    await prisma.auditLog.create({
      data: {
        actorId: ids.get('admin'),
        action: ipAction,
        module: 'users',
        entityType: 'User',
        entityId: randomUUID(),
        ip: '203.0.113.99',
        afterState: { campo: 'valor' },
        occurredAt: T,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  describe('RF-62: solo ADMIN', () => {
    it('401 sin sesión y 403 para docente, estudiante y apoderado', async () => {
      await get(null, '/admin/audit-logs').expect(401);
      for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
        const res = await list(`action=${ipAction}`, key).expect(403);
        // El 403 no filtra filas de la bitácora.
        expect(JSON.stringify(res.body)).not.toContain(ipAction);
        expect(res.body).not.toHaveProperty('items');
      }
    });

    it('un docente no esquiva el rol con filtros válidos ni inválidos', async () => {
      await list('', 'docente01').expect(403);
      await list('page=999', 'docente01').expect(403);
    });
  });

  describe('RF-62: filtros en sus bordes', () => {
    it('una acción inexistente devuelve lista vacía, no error', async () => {
      const res = await list(`action=${tag()}`).expect(200);
      expect(res.body).toEqual({ items: [], page: 1, pageSize: 50, total: 0 });
    });

    it('una acción en mayúsculas no es válida (la búsqueda es exacta y en minúsculas)', async () => {
      await list(`action=${rangeAction.toUpperCase()}`).expect(400);
    });

    it('from y to son inclusivos: el mismo instante en ambos extremos trae esa fila', async () => {
      const res = await list(
        `action=${rangeAction}&from=${iso(T.getTime() + 1000)}&to=${iso(T.getTime() + 1000)}`,
      ).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].occurredAt).toBe(new Date(T.getTime() + 1000).toISOString());
    });

    it('un milisegundo fuera del rango deja la fila fuera', async () => {
      const miss = await list(
        `action=${rangeAction}&from=${iso(T.getTime() + 1001)}&to=${iso(T.getTime() + 1999)}`,
      ).expect(200);
      expect(miss.body.total).toBe(0);
      const before = await list(
        `action=${rangeAction}&from=${iso(T.getTime() - 1000)}&to=${iso(T.getTime() - 1)}`,
      ).expect(200);
      expect(before.body.total).toBe(0);
      const edge = await list(
        `action=${rangeAction}&from=${iso(T.getTime() + 1001)}&to=${iso(T.getTime() + 2000)}`,
      ).expect(200);
      expect(edge.body.total).toBe(1);
    });

    it('solo from o solo to funcionan como cota abierta', async () => {
      const onlyFrom = await list(`action=${rangeAction}&from=${iso(T.getTime() + 1000)}`).expect(
        200,
      );
      expect(onlyFrom.body.total).toBe(2);
      const onlyTo = await list(`action=${rangeAction}&to=${iso(T.getTime() + 1000)}`).expect(200);
      expect(onlyTo.body.total).toBe(2);
    });

    it('acepta fechas con zona horaria de Lima (-05:00) y las compara en UTC', async () => {
      const shifted = new Date(T.getTime() + 1000 - 5 * 3_600_000);
      const limaLocal = shifted.toISOString().replace('Z', '-05:00');
      const res = await list(
        `action=${rangeAction}&from=${encodeURIComponent(limaLocal)}&to=${encodeURIComponent(limaLocal)}`,
      ).expect(200);
      expect(res.body.total).toBe(1);
    });

    it('rango de 400 días exactos: 200; 400 días y 1 ms: 400', async () => {
      const from = T.getTime() - 400 * DAY;
      await list(`action=${rangeAction}&from=${iso(from)}&to=${iso(from + 400 * DAY)}`).expect(200);
      const over = await list(
        `action=${rangeAction}&from=${iso(from)}&to=${iso(from + 400 * DAY + 1)}`,
      ).expect(400);
      expect(JSON.stringify(over.body)).not.toMatch(/stack|at .*\.ts/);
    });

    it('to anterior a from: 400', async () => {
      await list(`from=${iso(T.getTime())}&to=${iso(T.getTime() - 1)}`).expect(400);
    });

    it('actorId con un UUID válido pero sin filas devuelve 0; con basura, 400', async () => {
      const none = await list(`action=${rangeAction}&actorId=${randomUUID()}`).expect(200);
      expect(none.body.total).toBe(0);
      await list(`actorId=${ids.get('admin')}%27%20OR%201=1`).expect(400);
    });

    it('módulo y acción de texto con inyección se rechazan sin llegar a la consulta', async () => {
      await list(`module=${encodeURIComponent("grading' OR '1'='1")}`).expect(400);
      await list(`action=${encodeURIComponent('a" OR 1=1 --')}`).expect(400);
      await list(`action=${'a'.repeat(101)}`).expect(400);
      await list(`module=${'a'.repeat(41)}`).expect(400);
    });
  });

  describe('RF-62: paginación', () => {
    it('51 filas: 50 en la página 1, 1 en la 2, sin repetir ni perder ninguna', async () => {
      const p1 = await list(`action=${pageAction}`).expect(200);
      const p2 = await list(`action=${pageAction}&page=2`).expect(200);
      const p3 = await list(`action=${pageAction}&page=3`).expect(200);
      expect(p1.body).toMatchObject({ page: 1, pageSize: 50, total: 51 });
      expect(p1.body.items).toHaveLength(50);
      expect(p2.body).toMatchObject({ page: 2, total: 51 });
      expect(p2.body.items).toHaveLength(1);
      expect(p3.body).toMatchObject({ page: 3, total: 51, items: [] });

      const all = [...p1.body.items, ...p2.body.items].map((i: Item) => i.id);
      expect(new Set(all).size).toBe(51);
      // Mismo instante en todas: el desempate es id descendente y estable entre páginas.
      expect([...all].sort().reverse()).toEqual(all);
    });

    it('la página 1 se asume si no se envía y page=1 da lo mismo', async () => {
      const a = await list(`action=${pageAction}`).expect(200);
      const b = await list(`action=${pageAction}&page=1`).expect(200);
      expect(b.body).toEqual(a.body);
    });

    it('page=200 es válida (vacía) y page=201, 0, -1 o 1.5 dan 400', async () => {
      const last = await list(`action=${pageAction}&page=200`).expect(200);
      expect(last.body).toMatchObject({ page: 200, total: 51, items: [] });
      for (const page of ['201', '0', '-1', '1.5', 'abc']) {
        await list(`action=${pageAction}&page=${page}`).expect(400);
      }
    });

    it('el tamaño de página no se puede cambiar desde la URL', async () => {
      await list(`action=${pageAction}&pageSize=500`).expect(400);
      await list(`action=${pageAction}&limit=500`).expect(400);
    });
  });

  describe('U9: el modo soporte se deriva al leer', () => {
    it('es true solo cuando un ADMIN actúa en contents, submissions o grading', async () => {
      const res = await list(`action=${supportAction}`).expect(200);
      expect(res.body.total).toBe(11);
      const flags = new Map(
        (res.body.items as Array<Item & { entityType: string }>).map((i) => [
          i.entityType,
          i.supportMode,
        ]),
      );
      expect(Object.fromEntries(flags)).toEqual({
        'E-admin-contents': true,
        'E-admin-submissions': true,
        'E-admin-grading': true,
        'E-admin-users': false,
        'E-admin-files': false,
        'E-admin-auth': false,
        'E-docente01-grading': false,
        'E-docente01-contents': false,
        'E-estudiante01-submissions': false,
        'E-apoderado01-grading': false,
        'E-sistema-grading': false,
      });
    });

    it('la fila del sistema (actor null) no es modo soporte aunque sea de notas', async () => {
      const res = await list(`action=${supportAction}&module=grading`).expect(200);
      const system = (res.body.items as Item[]).find((i) => i.actor === null);
      expect(system?.supportMode).toBe(false);
    });

    it('el rol del actor sale de la BD, no de la fila: el docente nunca marca soporte', async () => {
      const res = await list(`action=${supportAction}&actorId=${ids.get('docente01')}`).expect(200);
      expect(res.body.total).toBe(2);
      for (const i of res.body.items as Item[]) {
        expect(i.actor?.role).toBe('TEACHER');
        expect(i.supportMode).toBe(false);
      }
    });

    it('supportMode no se guarda: no hay una columna que lo contenga', async () => {
      const columns = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AuditLog'`;
      expect(columns.map((c) => c.COLUMN_NAME.toLowerCase())).not.toContain('supportmode');
    });
  });

  describe('RNF-09: la IP no se expone', () => {
    it('ni en la fila ni en el actor, aunque la BD la guarde', async () => {
      const stored = await prisma.auditLog.findFirstOrThrow({ where: { action: ipAction } });
      expect(stored.ip).toBe('203.0.113.99');

      const res = await list(`action=${ipAction}`).expect(200);
      expect(res.body.total).toBe(1);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('203.0.113.99');
      expect(text).not.toMatch(/"ip"/i);
      const item = res.body.items[0] as Item;
      expect(Object.keys(item).sort()).toEqual(
        [
          'action',
          'actor',
          'afterState',
          'beforeState',
          'entityId',
          'entityType',
          'id',
          'module',
          'occurredAt',
          'supportMode',
        ].sort(),
      );
      // El actor solo trae id, nombre y rol: nada de correo ni documento.
      expect(Object.keys(item.actor!).sort()).toEqual(['fullName', 'id', 'role']);
    });

    it('el parámetro ip no sirve para filtrar ni para adivinar la IP', async () => {
      await list(`action=${ipAction}&ip=203.0.113.99`).expect(400);
    });
  });
});
