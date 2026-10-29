import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { MemorySessionStore, SessionStore } from './../src/common/session/session.store.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { INSTITUTION_EMAIL_DOMAIN } from './../src/modules/users/institution-domain.js';
import { MIB } from './../src/modules/users/import/import.constants.js';
import {
  buildZip,
  inlineCell,
  minimalParts,
  rawXlsx,
  unicodePathExtra,
} from './../src/modules/users/import/zip-builder.mock-spec.js';
import { MemoryAuditSink } from './helpers.js';

// RF-21: importacion masiva de usuarios. Usa MySQL real con el seed cargado (solo local con
// Docker). Archivos generados en el test (sin binarios en el repo). Solo crea usuarios
// qa-f4-*@colegio.example en 3A/3B de 2026 (y la seccion inactiva 3F, que se borra al final).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const DOMAIN = 'colegio.example';
const QA_PREFIX = 'qa-f4-';
const INACTIVE_SECTION = 'F';
const qa = (key: string, domain = DOMAIN) => `${QA_PREFIX}${key}@${domain}`;

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cell = string | number | boolean | Date | Record<string, unknown>;

const STUDENT_HEADER = ['correo', 'nombre_completo', 'grado', 'seccion'];
const TEACHER_HEADER = ['correo', 'nombre_completo'];
const GUARDIAN_HEADER = ['correo_apoderado', 'nombre_apoderado', 'correo_estudiante'];

// --- Generadores de archivos ---------------------------------------------------------------

const csvLine = (cells: string[], sep: string) => cells.join(sep);
const csv = (
  rows: string[][],
  opts: { sep?: string; bom?: boolean; eol?: string } = {},
): Buffer => {
  const sep = opts.sep ?? ',';
  const text = rows.map((r) => csvLine(r, sep)).join(opts.eol ?? '\n') + (opts.eol ?? '\n');
  return Buffer.from((opts.bom ? '﻿' : '') + text, 'utf8');
};

const xlsx = async (rows: Cell[][]): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Datos');
  for (const row of rows) sheet.addRow(row as ExcelJS.CellValue[]);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

type Upload = { name: string; data: Buffer };
type SendOptions = {
  type?: string;
  sha256?: string;
  file?: Upload | null;
  extra?: Record<string, string>;
};

const noopThrottler = {
  increment: () =>
    Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

type Harness = {
  app: INestApplication<App>;
  sink: MemoryAuditSink;
  sessions: SessionService;
};

async function buildApp(options: { throttle: boolean }): Promise<Harness> {
  const sink = new MemoryAuditSink();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SessionStore)
    .useValue(new MemorySessionStore())
    .overrideProvider(AuditSink)
    .useValue(sink)
    .overrideProvider(INSTITUTION_EMAIL_DOMAIN)
    .useValue(DOMAIN);
  // El limite propio de preview/commit (10 por minuto) se desactiva en la app principal para no
  // obligar a trocear los casos; el bloque de 429 usa una app propia con el limitador real.
  if (!options.throttle)
    builder = builder.overrideProvider(ThrottlerStorage).useValue(noopThrottler);
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return { app, sink, sessions: app.get(SessionService) };
}

describe.skipIf(!process.env.DATABASE_URL)('Importacion masiva RF-21 (e2e, MySQL)', () => {
  let h: Harness;
  let prisma: PrismaClient;
  let baseline: Record<string, number>;
  let sec3A: string;
  let sec3B: string;
  let yearId: string;

  const cookies = new Map<string, string>();
  const bodies: string[] = []; // cuerpos JSON de respuestas de import (revision de fugas)
  let successfulCommits = 0;

  const http = () => request(h.app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;

  const send = (
    key: string | null,
    url: string,
    o: SendOptions = {},
    server: INestApplication<App> = h.app,
  ) => {
    const req = request(server.getHttpServer()).post(API + url);
    if (key) req.set('Cookie', as(key));
    if (o.type !== undefined) req.field('type', o.type);
    if (o.sha256 !== undefined) req.field('sha256', o.sha256);
    for (const [k, v] of Object.entries(o.extra ?? {})) req.field(k, v);
    if (o.file) req.attach('file', o.file.data, { filename: o.file.name });
    return req;
  };
  const rec = (res: request.Response) => {
    bodies.push(JSON.stringify(res.body));
    return res;
  };
  const preview = async (type: string, name: string, data: Buffer, key = 'admin') =>
    rec(await send(key, '/users/import/preview', { type, file: { name, data } }));
  const commit = async (type: string, name: string, data: Buffer, hash = sha256(data)) => {
    const res = rec(
      await send('admin', '/users/import/commit', { type, sha256: hash, file: { name, data } }),
    );
    if (res.status === 201) successfulCommits++;
    return res;
  };
  const codes = (res: request.Response) =>
    (res.body.errors as Json[]).map((e) => `${e.row}:${e.column}:${e.code}`);
  const detailCodes = (res: request.Response) =>
    (res.body.error.details as Json[]).map((e) => `${e.row}:${e.column}:${e.code}`);

  const counts = async () => ({
    years: await prisma.academicYear.count(),
    sections: await prisma.section.count(),
    users: await prisma.user.count(),
    enrollments: await prisma.enrollment.count(),
    links: await prisma.guardianStudent.count(),
    courses: await prisma.course.count(),
    courseSections: await prisma.courseSection.count(),
  });

  const cleanQaData = async () => {
    const users = await prisma.user.findMany({
      where: { institutionalEmail: { startsWith: QA_PREFIX } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.guardianStudent.deleteMany({
      where: { OR: [{ guardianId: { in: ids } }, { studentId: { in: ids } }] },
    });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.section.deleteMany({ where: { academicYearId: yearId, code: INACTIVE_SECTION } });
  };

  const createSession = async (key: string, userId: string, role: Role) => {
    cookies.set(key, await h.sessions.create({ id: userId, role }));
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    yearId = y2026.id;
    await cleanQaData(); // por si una corrida anterior se interrumpio
    baseline = await counts();
    sec3A = (
      await prisma.section.findFirstOrThrow({
        where: { academicYearId: yearId, gradeLevel: 3, code: 'A' },
      })
    ).id;
    sec3B = (
      await prisma.section.findFirstOrThrow({
        where: { academicYearId: yearId, gradeLevel: 3, code: 'B' },
      })
    ).id;
    await prisma.section.create({
      data: { academicYearId: yearId, gradeLevel: 3, code: INACTIVE_SECTION, isActive: false },
    });
    const inactiveAdmin = await prisma.user.create({
      data: {
        institutionalEmail: qa('admin-inactivo'),
        fullName: 'QA F4 Admin Inactivo',
        role: 'ADMIN',
        status: 'INACTIVE',
      },
    });
    await prisma.user.create({
      data: {
        institutionalEmail: qa('retirado'),
        fullName: 'QA F4 Retirado',
        role: 'STUDENT',
        status: 'WITHDRAWN',
      },
    });

    h = await buildApp({ throttle: false });
    for (const key of ['admin', 'docente01', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@${DOMAIN}` },
      });
      await createSession(key, user.id, user.role as Role);
    }
    await createSession('adminInactivo', inactiveAdmin.id, 'ADMIN');
  });

  afterAll(async () => {
    try {
      await cleanQaData();
    } finally {
      await h?.app.close();
      await prisma.$disconnect();
    }
  });

  // ---------------------------------------------------------------------------------------
  describe('Autenticacion y roles (RF-21)', () => {
    const tiny = { name: 'a.csv', data: csv([TEACHER_HEADER, [qa('auth'), 'QA F4 Auth']]) };
    const call = (key: string | null, route: string) => {
      if (route === 'template') {
        const r = http().get(`${API}/users/import/template?type=students&format=csv`);
        return key ? r.set('Cookie', as(key)) : r;
      }
      return send(key, `/users/import/${route}`, {
        type: 'teachers',
        sha256: route === 'commit' ? 'a'.repeat(64) : undefined,
        file: tiny,
      });
    };

    it.each(['template', 'preview', 'commit'])(
      'RF-21: %s responde 401 sin sesion',
      async (route) => {
        expect((await call(null, route)).status).toBe(401);
      },
    );

    it.each(['template', 'preview', 'commit'])(
      'RF-21: %s responde 403 a docente, estudiante y apoderado',
      async (route) => {
        for (const key of ['docente01', 'estudiante01', 'apoderado01']) {
          expect((await call(key, route)).status, `${key} ${route}`).toBe(403);
        }
      },
    );

    it.each(['template', 'preview', 'commit'])(
      'RF-21: %s responde 403 a un ADMIN inactivo (ActiveActorGuard)',
      async (route) => {
        expect((await call('adminInactivo', route)).status).toBe(403);
      },
    );

    it.each(['preview', 'commit'])(
      'RF-21: %s sin sesion y con archivo de 1 MiB + 1 responde 401, no 413',
      async (route) => {
        const big = Buffer.alloc(MIB + 1, 0x61);
        const res = await send(null, `/users/import/${route}`, {
          type: 'teachers',
          sha256: route === 'commit' ? 'a'.repeat(64) : undefined,
          file: { name: 'grande.csv', data: big },
        });
        expect(res.status).toBe(401);
      },
    );
  });

  // ---------------------------------------------------------------------------------------
  describe('Plantillas (RF-21)', () => {
    const headers: Record<string, string[]> = {
      students: STUDENT_HEADER,
      teachers: TEACHER_HEADER,
      guardians: GUARDIAN_HEADER,
    };
    const combos = ['students', 'teachers', 'guardians'].flatMap((t) =>
      ['csv', 'xlsx'].map((f) => [t, f] as const),
    );

    it.each(combos)('RF-21: plantilla %s en %s con cabeceras de descarga', async (type, format) => {
      const res = await http()
        .get(`${API}/users/import/template?type=${type}&format=${format}`)
        .set('Cookie', as('admin'))
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="plantilla-${type}.${format}"`,
      );
      expect(res.headers['cache-control']).toContain('no-store');
      const body = res.body as Buffer;
      if (format === 'csv') {
        expect(res.headers['content-type']).toContain('text/csv');
        expect(body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
        expect(body.toString('utf8').replace(/^﻿/, '').trim()).toBe(headers[type].join(','));
      } else {
        expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(body as unknown as ExcelJS.Buffer);
        expect(wb.worksheets.map((w) => w.name)).toEqual(['Datos', 'Instrucciones']);
        const sheet = wb.getWorksheet('Datos')!;
        expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(headers[type]);
        // sin filas de ejemplo: ninguna celda con valor debajo del encabezado
        for (let r = 2; r <= sheet.rowCount; r++) {
          sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
            expect(cell.value, `fila ${r}`).toBeNull();
          });
        }
      }
    });

    it('RF-21: la plantilla vacia no se puede importar: sin filas de datos responde 400', async () => {
      const csvTemplate = await http()
        .get(`${API}/users/import/template?type=teachers&format=csv`)
        .set('Cookie', as('admin'))
        .buffer(true)
        .parse(binaryParser);
      expect((await preview('teachers', 'plantilla.csv', csvTemplate.body)).status).toBe(400);
    });

    it.each(['csv', 'xlsx'] as const)(
      'RF-21: round-trip: la plantilla %s descargada se vuelve a subir y valida',
      async (format) => {
        const download = async (type: string) =>
          (
            await http()
              .get(`${API}/users/import/template?type=${type}&format=${format}`)
              .set('Cookie', as('admin'))
              .buffer(true)
              .parse(binaryParser)
              .expect(200)
          ).body as Buffer;
        const name = `plantilla.${format}`;
        // La plantilla tal cual pasa el guard y el formato: solo falla por "sin filas de datos".
        const empty = await preview('teachers', name, await download('teachers'));
        expect(empty.status).toBe(400);
        expect(empty.body.error.code).toBe('VALIDATION_ERROR');
        const cases: [string, (string | number)[]][] = [
          ['teachers', [qa('rt-doc'), 'QA F4 Round Docente']],
          ['students', [qa('rt-est'), 'QA F4 Round Estudiante', 3, 'A']],
          [
            'guardians',
            [qa('rt-apo', 'gmail.com'), 'QA F4 Round Apoderado', `estudiante01@${DOMAIN}`],
          ],
        ];
        for (const [type, row] of cases) {
          const base = await download(type);
          let data: Buffer;
          if (format === 'csv') {
            data = Buffer.concat([base, Buffer.from(`${row.join(',')}\n`)]);
          } else {
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(base as unknown as ExcelJS.Buffer);
            wb.getWorksheet('Datos')!.addRow(row);
            data = Buffer.from(await wb.xlsx.writeBuffer());
          }
          const res = await preview(type, name, data);
          expect(res.status, type).toBe(200);
          expect(res.body, type).toMatchObject({ totalRows: 1, errorRows: 0, canConfirm: true });
        }
      },
    );

    it('RF-21: parametros invalidos de la plantilla responden 400', async () => {
      for (const q of [
        'type=foo&format=csv',
        'type=students&format=xls',
        'type=students',
        'type=students&format=csv&extra=1',
      ]) {
        await http()
          .get(`${API}/users/import/template?${q}`)
          .set('Cookie', as('admin'))
          .expect(400);
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Estudiantes: preview y commit (RF-21, RF-19, RF-24)', () => {
    const s1 = qa('s01');
    const s2 = qa('s02');
    const file = csv([
      STUDENT_HEADER,
      [s1.toUpperCase(), 'QA F4  Estudiante   Uno', '3', 'a'], // correo en mayusculas, seccion en minuscula
      [s2, 'QA F4 Estudiante Dos', '3', 'B'],
    ]);

    it('RF-21: preview CSV valido no escribe y devuelve el resumen y el SHA-256', async () => {
      const before = await counts();
      const res = await preview('students', 'estudiantes.csv', file);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        type: 'students',
        format: 'csv',
        sha256: sha256(file),
        totalRows: 2,
        validRows: 2,
        errorRows: 0,
        errors: [],
        errorsTruncated: false,
        summary: { users: 2, enrollments: 2, links: 0 },
        canConfirm: true,
      });
      expect(await counts()).toEqual(before);
    });

    it('RF-21: commit crea usuarios y matriculas vigentes en 3A y 3B del año activo', async () => {
      const before = await counts();
      const res = await commit('students', 'estudiantes.csv', file);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        type: 'students',
        created: { users: 2, enrollments: 2, links: 0 },
      });
      const after = await counts();
      expect(after.users).toBe(before.users + 2);
      expect(after.enrollments).toBe(before.enrollments + 2);
      expect(after.links).toBe(before.links);

      const u1 = await prisma.user.findUniqueOrThrow({ where: { institutionalEmail: s1 } });
      expect(u1).toMatchObject({
        role: 'STUDENT',
        status: 'ACTIVE',
        fullName: 'QA F4 Estudiante Uno',
      });
      const e1 = await prisma.enrollment.findMany({ where: { studentId: u1.id } });
      expect(e1).toHaveLength(1);
      expect(e1[0]).toMatchObject({ sectionId: sec3A, academicYearId: yearId, isCurrent: true });
      const u2 = await prisma.user.findUniqueOrThrow({ where: { institutionalEmail: s2 } });
      const e2 = await prisma.enrollment.findFirstOrThrow({ where: { studentId: u2.id } });
      expect(e2).toMatchObject({ sectionId: sec3B, academicYearId: yearId, isCurrent: true });
    });

    it('RF-21: repetir el mismo archivo responde 422 EMAIL_TAKEN sin cambiar nada', async () => {
      const before = await counts();
      const pre = await preview('students', 'estudiantes.csv', file);
      expect(pre.status).toBe(200);
      expect(codes(pre)).toEqual(['2:correo:EMAIL_TAKEN', '3:correo:EMAIL_TAKEN']);
      expect(pre.body.canConfirm).toBe(false);
      const res = await commit('students', 'estudiantes.csv', file);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(detailCodes(res)).toEqual(['2:correo:EMAIL_TAKEN', '3:correo:EMAIL_TAKEN']);
      expect(await counts()).toEqual({
        ...before,
      });
    });

    it('RF-21: CSV con ";" y BOM, tildes y eñes; el commit conserva el nombre', async () => {
      const data = csv(
        [
          STUDENT_HEADER,
          [qa('s03'), 'QA F4 Ñandú Pérez', '3', 'A'],
          [qa('s04'), 'QA F4 Ibáñez', '3', 'B'],
        ],
        { sep: ';', bom: true, eol: '\r\n' },
      );
      const pre = await preview('students', 'excel-es.csv', data);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({ totalRows: 2, validRows: 2, canConfirm: true });
      const res = await commit('students', 'excel-es.csv', data);
      expect(res.status).toBe(201);
      const u = await prisma.user.findUniqueOrThrow({ where: { institutionalEmail: qa('s03') } });
      expect(u.fullName).toBe('QA F4 Ñandú Pérez');
    });

    it('RF-21: campo entre comillas con coma, encabezados con tildes y en otro orden', async () => {
      const data = Buffer.from(
        'Sección,Grado,"Nombre Completo",Correo\n' + `A,3,"QA F4 Pérez, Ana",${qa('s05')}\n` + '\n',
        'utf8',
      );
      const res = await preview('students', 'otro-orden.csv', data);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalRows: 1, validRows: 1, canConfirm: true });
    });

    it('RF-21: las filas vacias se ignoran y el numero de fila es el fisico', async () => {
      const data = Buffer.from(`${STUDENT_HEADER.join(',')}\n,,,\n\n${qa('s06')},ab,3,A\n`, 'utf8');
      const res = await preview('students', 'vacias.csv', data);
      expect(res.status).toBe(200);
      expect(res.body.totalRows).toBe(1);
      expect(codes(res)).toEqual(['4:nombre_completo:INVALID_NAME']);
    });

    it('RF-21: preview XLSX de estudiantes (grado como numero entero) y commit', async () => {
      const data = await xlsx([STUDENT_HEADER, [qa('s07'), 'QA F4 Estudiante Siete', 3, 'A']]);
      const pre = await preview('students', 'estudiantes.xlsx', data);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({ format: 'xlsx', validRows: 1, canConfirm: true });
      const res = await commit('students', 'estudiantes.xlsx', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 1, enrollments: 1, links: 0 });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Docentes: preview y commit (RF-21, RF-22)', () => {
    it('RF-21/RF-22: preview y commit de docentes en XLSX, con correo en mayusculas normalizado', async () => {
      const data = await xlsx([
        TEACHER_HEADER,
        [qa('t01').toUpperCase(), 'QA F4 Docente Uno'],
        [qa('t02'), 'QA F4 Docente Dos'],
      ]);
      const pre = await preview('teachers', 'docentes.xlsx', data);
      expect(pre.body).toMatchObject({
        type: 'teachers',
        format: 'xlsx',
        totalRows: 2,
        validRows: 2,
        summary: { users: 2, enrollments: 0, links: 0 },
        canConfirm: true,
      });
      const res = await commit('teachers', 'docentes.xlsx', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 2, enrollments: 0, links: 0 });
      const u = await prisma.user.findUniqueOrThrow({ where: { institutionalEmail: qa('t01') } });
      expect(u).toMatchObject({ role: 'TEACHER', status: 'ACTIVE' });
    });

    it('RF-21: docente con dominio ajeno → EMAIL_DOMAIN (INSTITUTION_EMAIL_DOMAIN)', async () => {
      const data = csv([TEACHER_HEADER, [qa('t03', 'otro.example'), 'QA F4 Docente Tres']]);
      const res = await preview('teachers', 'dom.csv', data);
      expect(codes(res)).toEqual(['2:correo:EMAIL_DOMAIN']);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Apoderados: preview y commit (RF-21, RF-20)', () => {
    const g1 = qa('g01', 'gmail.example'); // dominio ajeno: el apoderado esta exento (D-013)

    it('RF-21/RF-20/D-013: apoderado con 2 hijos y dominio ajeno: preview y commit', async () => {
      const data = csv(
        [
          GUARDIAN_HEADER,
          [g1, 'QA F4 Apoderado Uno', qa('s01')],
          [g1, 'QA F4 Apoderado Uno', qa('s02')],
        ],
        { sep: ';', bom: true },
      );
      const pre = await preview('guardians', 'apoderados.csv', data);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({
        totalRows: 2,
        validRows: 2,
        summary: { users: 1, enrollments: 0, links: 2 },
        canConfirm: true,
      });
      const before = await counts();
      const res = await commit('guardians', 'apoderados.csv', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 1, enrollments: 0, links: 2 });
      const after = await counts();
      expect(after.users).toBe(before.users + 1);
      expect(after.links).toBe(before.links + 2);

      const g = await prisma.user.findUniqueOrThrow({ where: { institutionalEmail: g1 } });
      expect(g).toMatchObject({ role: 'GUARDIAN', status: 'ACTIVE' });
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: g.id },
        include: { student: true },
      });
      expect(links.every((l) => l.isActive)).toBe(true);
      expect(links.map((l) => l.student.institutionalEmail).sort()).toEqual([qa('s01'), qa('s02')]);
    });

    it('RF-21: el estudiante del archivo de apoderados no se valida contra el dominio', async () => {
      // El alumno del seed existe; el apoderado nuevo es de otro dominio y no da EMAIL_DOMAIN.
      const data = csv([
        GUARDIAN_HEADER,
        [qa('g02', 'otro.example'), 'QA F4 Apoderado Dos', `estudiante05@${DOMAIN}`],
      ]);
      const res = await preview('guardians', 'g.csv', data);
      expect(res.body.canConfirm).toBe(true);
    });

    it('RF-21: apoderado XLSX con un hijo', async () => {
      const data = await xlsx([GUARDIAN_HEADER, [qa('g03'), 'QA F4 Apoderado Tres', qa('s03')]]);
      const res = await commit('guardians', 'g.xlsx', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 1, enrollments: 0, links: 1 });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Codigos de error por fila (RF-21)', () => {
    it('RF-21: students: todos los codigos de fila del CSV, con fila y columna', async () => {
      const long = 'N'.repeat(501);
      const data = csv([
        STUDENT_HEADER,
        ['', 'QA F4 Uno', '3', 'A'], // 2 REQUIRED
        ['no-es-correo', 'QA F4 Dos', '3', 'A'], // 3 INVALID_EMAIL
        [qa('dom', 'otro.example'), 'QA F4 Tres', '3', 'A'], // 4 EMAIL_DOMAIN
        [qa('nom'), 'ab', '3', 'A'], // 5 INVALID_NAME
        [qa('nom2'), '=cmd|ZZSENTINELA', '3', 'A'], // 6 INVALID_NAME (formula)
        [qa('gr'), 'QA F4 Grado', '9', 'A'], // 7 INVALID_GRADE
        [qa('se'), 'QA F4 Seccion', '3', '!!'], // 8 INVALID_SECTION
        [qa('sn'), 'QA F4 Sin Seccion', '3', 'Z'], // 9 SECTION_NOT_FOUND
        [qa('si'), 'QA F4 Seccion Inactiva', '3', INACTIVE_SECTION], // 10 SECTION_INACTIVE
        [qa('dup'), 'QA F4 Duplicado', '3', 'A'], // 11 valida
        [qa('dup'), 'QA F4 Duplicado', '3', 'A'], // 12 DUPLICATE_IN_FILE
        [`estudiante01@${DOMAIN}`, 'QA F4 Ocupado', '3', 'A'], // 13 EMAIL_TAKEN
        [qa('ext'), 'QA F4 Extra', '3', 'A', 'sobra'], // 14 EXTRA_CELLS
        [qa('lar'), long, '3', 'A'], // 15 TOO_LONG
        [qa('ok'), 'QA F4 Valido', '3', 'B'], // 16 valida
      ]);
      const res = await preview('students', 'codigos.csv', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '2:correo:REQUIRED',
        '3:correo:INVALID_EMAIL',
        '4:correo:EMAIL_DOMAIN',
        '5:nombre_completo:INVALID_NAME',
        '6:nombre_completo:INVALID_NAME',
        '7:grado:INVALID_GRADE',
        '8:seccion:INVALID_SECTION',
        '9:seccion:SECTION_NOT_FOUND',
        '10:seccion:SECTION_INACTIVE',
        '12:correo:DUPLICATE_IN_FILE',
        '13:correo:EMAIL_TAKEN',
        '14:null:EXTRA_CELLS',
        '15:nombre_completo:TOO_LONG',
      ]);
      expect(res.body).toMatchObject({
        totalRows: 15,
        validRows: 2,
        errorRows: 13,
        errorsTruncated: false,
        canConfirm: false,
        summary: { users: 2, enrollments: 2, links: 0 },
      });
      const dup = (res.body.errors as Json[]).find((e) => e.code === 'DUPLICATE_IN_FILE')!;
      expect(dup.message).toContain('fila 11');
      for (const e of res.body.errors as Json[]) {
        expect(typeof e.message).toBe('string');
        expect(e.message.length).toBeGreaterThan(0);
      }
    });

    it('RF-21: students XLSX: FORMULA_NOT_ALLOWED e INVALID_CELL (fecha, booleano, decimal)', async () => {
      const data = await xlsx([
        STUDENT_HEADER,
        [qa('x1'), { formula: 'HYPERLINK("http://x","y")', result: 'y' }, 3, 'A'], // 2
        [qa('x2'), 'QA F4 Fecha', new Date(Date.UTC(2026, 0, 1)), 'A'], // 3
        [qa('x3'), 'QA F4 Booleano', true, 'A'], // 4
        [qa('x4'), 'QA F4 Decimal', 3.5, 'A'], // 5
        [qa('x5'), 'QA F4 Valido', 3, 'a'], // 6 valida
      ]);
      const res = await preview('students', 'celdas.xlsx', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '2:nombre_completo:FORMULA_NOT_ALLOWED',
        '3:grado:INVALID_CELL',
        '4:grado:INVALID_CELL',
        '5:grado:INVALID_CELL',
      ]);
      expect(res.body).toMatchObject({ totalRows: 5, validRows: 1, canConfirm: false });
    });

    it('RF-21: teachers: REQUIRED, INVALID_EMAIL, DUPLICATE_IN_FILE y EMAIL_TAKEN', async () => {
      const data = csv([
        TEACHER_HEADER,
        [qa('t10'), ''], // 2 REQUIRED
        ['sin-arroba', 'QA F4 Docente'], // 3 INVALID_EMAIL
        [qa('t11'), 'QA F4 Docente Once'], // 4 valida
        [qa('t11'), 'QA F4 Docente Once'], // 5 DUPLICATE_IN_FILE
        [`docente01@${DOMAIN}`, 'QA F4 Ocupado'], // 6 EMAIL_TAKEN
      ]);
      const res = await preview('teachers', 'd.csv', data);
      expect(codes(res)).toEqual([
        '2:nombre_completo:REQUIRED',
        '3:correo:INVALID_EMAIL',
        '5:correo:DUPLICATE_IN_FILE',
        '6:correo:EMAIL_TAKEN',
      ]);
    });

    it('RF-21: guardians: todos los codigos de fila', async () => {
      const data = csv([
        GUARDIAN_HEADER,
        [qa('ga', 'otro.example'), 'QA F4 Apo A', `estudiante01@${DOMAIN}`], // 2 valida (exenta)
        [qa('ga', 'otro.example'), 'QA F4 Apo A', `estudiante01@${DOMAIN}`], // 3 DUPLICATE_LINK
        [qa('ga', 'otro.example'), 'QA F4 Otro Nombre', `estudiante02@${DOMAIN}`], // 4 NAME_MISMATCH
        [qa('gb'), 'QA F4 Apo B', qa('gb')], // 5 SAME_PERSON
        [qa('gc'), 'QA F4 Apo C', qa('noexiste')], // 6 STUDENT_NOT_FOUND
        [qa('gd'), 'QA F4 Apo D', `docente01@${DOMAIN}`], // 7 NOT_STUDENT
        [qa('ge'), 'QA F4 Apo E', qa('retirado')], // 8 STUDENT_WITHDRAWN
        [`apoderado01@${DOMAIN}`, 'QA F4 Apo F', `estudiante03@${DOMAIN}`], // 9 EMAIL_TAKEN
        [qa('gg'), '', `estudiante04@${DOMAIN}`], // 10 REQUIRED
        [qa('gh'), 'QA F4 Apo H', 'no-es-correo'], // 11 INVALID_EMAIL
      ]);
      const res = await preview('guardians', 'g.csv', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '3:correo_estudiante:DUPLICATE_LINK',
        '4:nombre_apoderado:NAME_MISMATCH',
        '5:correo_estudiante:SAME_PERSON',
        '6:correo_estudiante:STUDENT_NOT_FOUND',
        '7:correo_estudiante:NOT_STUDENT',
        '8:correo_estudiante:STUDENT_WITHDRAWN',
        '9:correo_apoderado:EMAIL_TAKEN',
        '10:nombre_apoderado:REQUIRED',
        '11:correo_estudiante:INVALID_EMAIL',
      ]);
      expect(res.body.summary).toEqual({ users: 1, enrollments: 0, links: 1 });
    });

    it('RF-21: guardians: el hijo 11 de un apoderado → TOO_MANY_STUDENTS', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => [
        qa('gm', 'otro.example'),
        'QA F4 Apo Muchos',
        `estudiante${String(i + 1).padStart(2, '0')}@${DOMAIN}`,
      ]);
      const res = await preview('guardians', 'muchos.csv', csv([GUARDIAN_HEADER, ...rows]));
      expect(codes(res)).toEqual(['12:correo_estudiante:TOO_MANY_STUDENTS']);
      expect(res.body.summary).toEqual({ users: 1, enrollments: 0, links: 10 });
    });

    it('RF-21: errorsTruncated: mas de 500 errores se devuelven recortados', async () => {
      const rows = Array.from({ length: 600 }, (_, i) => [`malo${i}`, 'QA F4 Truncado', '3', 'A']);
      const res = await preview('students', 'truncado.csv', csv([STUDENT_HEADER, ...rows]));
      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(500);
      expect(res.body).toMatchObject({ errorsTruncated: true, errorRows: 600, canConfirm: false });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Archivo, formato y limites (RF-21, RNF-09)', () => {
    const okRow = [qa('lim'), 'QA F4 Limite'];

    it('RF-21: 1000 filas es el maximo valido; 1001 responde 400', async () => {
      const mk = (n: number) =>
        csv([
          TEACHER_HEADER,
          ...Array.from({ length: n }, (_, i) => [qa(`bulk${i}`), 'QA F4 Masivo']),
        ]);
      const ok = await preview('teachers', 'mil.csv', mk(1000));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ totalRows: 1000, canConfirm: true });
      const bad = await preview('teachers', 'milyuna.csv', mk(1001));
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RF-21: exactamente 1 MiB se acepta; 1 MiB + 1 responde 413', async () => {
      const base = csv([TEACHER_HEADER, okRow]);
      // Relleno: una sola linea de espacios (fila vacia) para no pasar de 5000 filas fisicas.
      const pad = (n: number) => Buffer.concat([Buffer.alloc(n - 1, 0x20), Buffer.from('\n')]);
      const exact = Buffer.concat([base, pad(MIB - base.length)]);
      expect(exact.length).toBe(MIB);
      const ok = await preview('teachers', 'exacto.csv', exact);
      expect(ok.status).toBe(200);
      const big = Buffer.concat([base, pad(MIB + 1 - base.length)]);
      const res = await preview('teachers', 'grande.csv', big);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      const resCommit = await commit('teachers', 'grande.csv', big);
      expect(resCommit.status).toBe(413);
    });

    it('RF-21: .exe renombrado responde 415 (como .csv, como .xlsx y con su extension)', async () => {
      const exe = Buffer.concat([
        Buffer.from('MZ'),
        Buffer.alloc(200, 0),
        Buffer.from('This program'),
      ]);
      for (const name of ['programa.csv', 'programa.xlsx', 'programa.exe']) {
        const res = await preview('teachers', name, exe);
        expect(res.status, name).toBe(415);
        expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      }
    });

    it('RF-21: formatos no admitidos (.xls, .ods, sin extension) y OLE cifrado responden 415', async () => {
      const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
      for (const name of ['a.xls', 'a.ods', 'a', 'a.xlsx']) {
        expect((await preview('teachers', name, ole)).status, name).toBe(415);
      }
    });

    it('RF-21: un ZIP con extension .csv o un CSV con extension .xlsx responde 415', async () => {
      const zip = buildZip(minimalParts());
      expect((await preview('teachers', 'zip.csv', zip)).status).toBe(415);
      expect((await preview('teachers', 'texto.xlsx', csv([TEACHER_HEADER, okRow]))).status).toBe(
        415,
      );
    });

    it('RF-21: xlsm (xl/vbaProject.bin) responde 415, tambien con extension .xlsx', async () => {
      const macros = buildZip([
        ...minimalParts(),
        { name: 'xl/vbaProject.bin', data: Buffer.from('macro') },
      ]);
      expect((await preview('teachers', 'macros.xlsx', macros)).status).toBe(415);
      expect((await preview('teachers', 'macros.xlsm', macros)).status).toBe(415);
      expect((await commit('teachers', 'macros.xlsx', macros)).status).toBe(415);
    });

    it('RF-21: bomba ZIP (30 MiB descomprimidos en menos de 1 MiB) responde 400', async () => {
      const bomb = buildZip([
        ...minimalParts(),
        { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(30 * MIB, 0x41) },
      ]);
      expect(bomb.length).toBeLessThan(MIB);
      const res = await preview('teachers', 'bomba.xlsx', bomb);
      expect(res.status).toBe(400);
      expect((await commit('teachers', 'bomba.xlsx', bomb)).status).toBe(400);
    });

    it('RF-21: ZIP con mas de 100 entradas → 400; con DOCTYPE en XML → 415', async () => {
      const many = buildZip([
        ...minimalParts(),
        ...Array.from({ length: 101 }, (_, i) => ({ name: `xl/media/i${i}.xml`, data: 'x' })),
      ]);
      expect((await preview('teachers', 'muchas.xlsx', many)).status).toBe(400);
      const xxe = buildZip([
        ...minimalParts(),
        { name: 'xl/sharedStrings.xml', data: '<!DOCTYPE foo [<!ENTITY x "y">]><sst/>' },
      ]);
      expect((await preview('teachers', 'xxe.xlsx', xxe)).status).toBe(415);
    });

    it('RF-21: ZIP con hueco junto al directorio central (offsets desplazados) → 400', async () => {
      const gap = buildZip(minimalParts(), { gapAfterCd: Buffer.alloc(64, 0x41) });
      expect((await preview('teachers', 'hueco.xlsx', gap)).status).toBe(400);
      expect((await commit('teachers', 'hueco.xlsx', gap)).status).toBe(400);
      const gapBefore = buildZip(minimalParts(), { gapBeforeCd: Buffer.alloc(64, 0x41) });
      expect((await preview('teachers', 'hueco2.xlsx', gapBefore)).status).toBe(400);
    });

    it('RF-21: extra field 0x7075 (nombre Unicode que renombra la entrada) → 415', async () => {
      const parts = minimalParts();
      parts[2] = {
        ...parts[2],
        centralExtra: unicodePathExtra('xl/workbook.xml', 'xl/otra.xml'),
      };
      const res = await preview('teachers', 'unicode.xlsx', buildZip(parts));
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('RF-21: estructura XLSX abusiva (mergeCell, nombre definido, col max) → 400', async () => {
      const row = `<sheetData><row r="1">${inlineCell('A1', 'x')}</row></sheetData>`;
      const merge = rawXlsx(`${row}<mergeCells><mergeCell ref="A1:XFD5000"/></mergeCells>`);
      const defined = rawXlsx(
        row,
        '<definedNames><definedName name="x">Datos!$A$1:$XFD$1048576</definedName></definedNames>',
      );
      const cols = rawXlsx(`<cols><col min="1" max="10000000" width="9"/></cols>${row}`);
      for (const [name, data] of [
        ['merge.xlsx', merge],
        ['nombre.xlsx', defined],
        ['columnas.xlsx', cols],
      ] as const) {
        const res = await preview('teachers', name, data);
        expect(res.status, name).toBe(400);
        expect(res.body.error.code, name).toBe('VALIDATION_ERROR');
        expect((await commit('teachers', name, data)).status, name).toBe(400);
      }
    });

    it('RF-21: 5001 filas fisicas (con vacias) en CSV y en XLSX → 400; 5000 pasan el limite', async () => {
      const header = `${TEACHER_HEADER.join(',')}\n${qa('fis')},QA F4 Fisico\n`;
      const csv5000 = Buffer.from(header + '\n'.repeat(4998)); // 5000 lineas fisicas
      const csv5001 = Buffer.from(header + '\n'.repeat(4999));
      expect((await preview('teachers', 'fis5000.csv', csv5000)).status).toBe(200);
      const bad = await preview('teachers', 'fis5001.csv', csv5001);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
      const head = `<row r="1">${inlineCell('A1', 'correo')}${inlineCell('B1', 'nombre_completo')}</row>`;
      const xl = (empty: number) =>
        rawXlsx(
          `<sheetData>${head}<row r="2">${inlineCell('A2', qa('fisx'))}${inlineCell('B2', 'QA F4 Fisico')}</row>` +
            Array.from({ length: empty }, (_, i) => `<row r="${i + 3}"/>`).join('') +
            '</sheetData>',
        );
      expect((await preview('teachers', 'fis5000.xlsx', xl(4998))).status).toBe(200);
      const xl5001 = xl(4999);
      expect(xl5001.length).toBeLessThan(MIB);
      const res = await preview('teachers', 'fis5001.xlsx', xl5001);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((await commit('teachers', 'fis5001.xlsx', xl5001)).status).toBe(400);
    });

    it('RF-21: CSV con mas de 16384 campos en un registro → 400', async () => {
      const wide = Buffer.from(`${TEACHER_HEADER.join(',')}\n${','.repeat(16_384)}\n`);
      const res = await preview('teachers', 'ancho.csv', wide);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('RF-21: parte XML del XLSX en UTF-16 (esquiva el filtro DOCTYPE) → 415', async () => {
      const utf16 = Buffer.from('\ufeff<!DOCTYPE x [<!ENTITY y "z">]><sst/>', 'utf16le');
      const res = await preview(
        'teachers',
        'utf16.xlsx',
        buildZip([...minimalParts(), { name: 'xl/sharedStrings.xml', data: utf16 }]),
      );
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('RF-21: CSV mal formado: no UTF-8, comilla sin cerrar → 400; byte NUL → 415', async () => {
      const latin1 = Buffer.concat([
        Buffer.from(`${TEACHER_HEADER.join(',')}\n${qa('l1')},QA F4 Jos`),
        Buffer.from([0xe9]),
        Buffer.from('\n'),
      ]);
      expect((await preview('teachers', 'latin1.csv', latin1)).status).toBe(400);
      const quote = Buffer.from(`${TEACHER_HEADER.join(',')}\n${qa('l2')},"QA F4 sin cerrar\n`);
      expect((await preview('teachers', 'comilla.csv', quote)).status).toBe(400);
      const nul = Buffer.from(`${TEACHER_HEADER.join(',')}\n${qa('l3')},QA F4\u0000X\n`);
      expect((await preview('teachers', 'nul.csv', nul)).status).toBe(415);
    });

    it('RF-21: encabezados invalidos (faltante, desconocido, repetido) y sin filas → 400', async () => {
      const cases: Buffer[] = [
        csv([['correo'], [qa('h1')]]),
        csv([
          [...TEACHER_HEADER, 'extra'],
          [qa('h2'), 'QA F4 Nombre', 'x'],
        ]),
        csv([
          ['correo', 'correo', 'nombre_completo'],
          [qa('h3'), qa('h3'), 'QA F4 Nombre'],
        ]),
        csv([TEACHER_HEADER]),
        Buffer.from('\n\n'),
      ];
      for (const data of cases) {
        expect((await preview('teachers', 'h.csv', data)).status).toBe(400);
      }
      // el tipo no coincide con el archivo
      expect((await preview('students', 'tipo.csv', csv([TEACHER_HEADER, okRow]))).status).toBe(
        400,
      );
    });

    it('RF-21: campos del multipart invalidos: sin archivo, archivo vacio, type o sha256 mal → 400', async () => {
      const data = csv([TEACHER_HEADER, okRow]);
      const bad: Array<[string, () => request.Test]> = [
        ['sin archivo', () => send('admin', '/users/import/preview', { type: 'teachers' })],
        [
          'archivo vacio',
          () =>
            send('admin', '/users/import/preview', {
              type: 'teachers',
              file: { name: 'v.csv', data: Buffer.alloc(0) },
            }),
        ],
        [
          'sin type',
          () => send('admin', '/users/import/preview', { file: { name: 'a.csv', data } }),
        ],
        [
          'type invalido',
          () =>
            send('admin', '/users/import/preview', { type: 'foo', file: { name: 'a.csv', data } }),
        ],
        [
          'campo de mas',
          () =>
            send('admin', '/users/import/preview', {
              type: 'teachers',
              extra: { foo: 'bar' },
              file: { name: 'a.csv', data },
            }),
        ],
        [
          'commit sin sha256',
          () =>
            send('admin', '/users/import/commit', {
              type: 'teachers',
              file: { name: 'a.csv', data },
            }),
        ],
        [
          'sha256 corto',
          () =>
            send('admin', '/users/import/commit', {
              type: 'teachers',
              sha256: 'abc',
              file: { name: 'a.csv', data },
            }),
        ],
      ];
      for (const [label, req] of bad) {
        const res = rec(await req());
        expect(res.status, label).toBe(400);
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Confirmacion: hash, errores y concurrencia (RF-21)', () => {
    it('RF-21: hash distinto al del archivo responde 409 y no escribe', async () => {
      const data = csv([TEACHER_HEADER, [qa('hs1'), 'QA F4 Hash Uno']]);
      const other = csv([TEACHER_HEADER, [qa('hs1'), 'QA F4 Hash Otro']]);
      const before = await counts();
      const res = await commit('teachers', 'h.csv', data, sha256(other));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(await counts()).toEqual(before);
    });

    it('RF-21: commit con errores de archivo responde 422 con details y no cambia los conteos', async () => {
      const data = csv([TEACHER_HEADER, [qa('ce1'), 'QA F4 Valido'], ['malo', 'QA F4 Invalido']]);
      const before = await counts();
      const res = await commit('teachers', 'e.csv', data);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(detailCodes(res)).toEqual(['3:correo:INVALID_EMAIL']);
      expect(await counts()).toEqual(before);
      expect(await prisma.user.count({ where: { institutionalEmail: qa('ce1') } })).toBe(0);
    });

    it('RF-21: todo o nada: una fila ocupada en la BD impide crear las demas (422)', async () => {
      const data = csv([
        STUDENT_HEADER,
        [qa('tn1'), 'QA F4 Todo Nada', '3', 'A'],
        [`estudiante02@${DOMAIN}`, 'QA F4 Ocupado', '3', 'A'],
      ]);
      const before = await counts();
      const res = await commit('students', 'tn.csv', data);
      expect(res.status).toBe(422);
      expect(detailCodes(res)).toEqual(['3:correo:EMAIL_TAKEN']);
      expect(await counts()).toEqual(before);
    });

    it('RF-21: seccion inactiva o inexistente en el commit → 422 sin escribir', async () => {
      const data = csv([
        STUDENT_HEADER,
        [qa('si1'), 'QA F4 Inactiva', '3', INACTIVE_SECTION],
        [qa('si2'), 'QA F4 Inexistente', '3', 'Z'],
      ]);
      const before = await counts();
      const res = await commit('students', 'si.csv', data);
      expect(res.status).toBe(422);
      expect(detailCodes(res)).toEqual([
        '2:seccion:SECTION_INACTIVE',
        '3:seccion:SECTION_NOT_FOUND',
      ]);
      expect(await counts()).toEqual(before);
    });

    it('RF-21: dos commits paralelos del mismo archivo → un 201 y el otro 409 (sin duplicar)', async () => {
      const data = csv([
        TEACHER_HEADER,
        [qa('par1'), 'QA F4 Paralelo Uno'],
        [qa('par2'), 'QA F4 Paralelo Dos'],
      ]);
      const before = await counts();
      const results = await Promise.all([
        send('admin', '/users/import/commit', {
          type: 'teachers',
          sha256: sha256(data),
          file: { name: 'p.csv', data },
        }),
        send('admin', '/users/import/commit', {
          type: 'teachers',
          sha256: sha256(data),
          file: { name: 'p.csv', data },
        }),
      ]);
      results.forEach(rec);
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      successfulCommits += statuses.filter((s) => s === 201).length;
      // Carrera de unicidad (P2002) → 409; si el segundo ya ve el correo ocupado → 422.
      expect(statuses[0]).toBe(201);
      expect([409, 422]).toContain(statuses[1]);
      expect(statuses).toEqual([201, 409]);
      const after = await counts();
      expect(after.users).toBe(before.users + 2);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Bitacora sin datos personales (RF-21, RNF-09/11, D-024)', () => {
    it('RF-21: un unico evento users.import.commit por importacion confirmada, sin correos ni nombres', async () => {
      const data = csv([
        STUDENT_HEADER,
        [qa('au1'), 'QA F4 Auditoria Uno', '3', 'A'],
        [qa('au2'), 'QA F4 Auditoria Dos', '3', 'B'],
      ]);
      const start = h.sink.records.length;
      // un preview, un commit rechazado (hash) y uno fallido (422) no registran nada
      await preview('students', 'au.csv', data);
      await commit('students', 'au.csv', data, 'b'.repeat(64));
      await commit('students', 'au.csv', csv([STUDENT_HEADER, ['malo', 'QA F4 Mal', '3', 'A']]));
      expect(h.sink.records.slice(start)).toHaveLength(0);

      const res = await commit('students', 'au.csv', data);
      expect(res.status).toBe(201);
      const mine = h.sink.records.slice(start);
      const events = mine.filter((r) => r.action === 'users.import.commit');
      expect(events).toHaveLength(1);
      expect(mine).toHaveLength(1);
      const ev = events[0];
      expect(ev.module).toBe('users');
      expect(ev.actorId).toBeTruthy();
      expect(ev.entityType).toBeUndefined();
      expect(ev.entityId).toBeUndefined();
      const after = ev.afterState as Json;
      expect(after).toMatchObject({
        type: 'students',
        format: 'csv',
        rows: 2,
        usersCreated: 2,
        enrollmentsCreated: 2,
        linksCreated: 0,
      });
      expect(after.userIds).toHaveLength(2);
      const created = await prisma.user.findMany({
        where: { institutionalEmail: { in: [qa('au1'), qa('au2')] } },
        select: { id: true },
      });
      expect((after.userIds as string[]).sort()).toEqual(created.map((u) => u.id).sort());
      const dump = JSON.stringify(ev);
      expect(dump).not.toContain('@');
      expect(dump).not.toContain(QA_PREFIX);
      expect(dump).not.toContain('QA F4');
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Rate limit propio de preview y commit (RF-21)', () => {
    let rl: Harness;
    let prevLimit: string | undefined;

    beforeAll(async () => {
      prevLimit = process.env.RATE_LIMIT_PER_MINUTE;
      process.env.RATE_LIMIT_PER_MINUTE = '1000'; // que solo actue el limite propio (10/min)
      rl = await buildApp({ throttle: true });
      const admin = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `admin@${DOMAIN}` },
      });
      cookies.set('rlAdmin', await rl.sessions.create({ id: admin.id, role: 'ADMIN' }));
    });

    afterAll(async () => {
      if (prevLimit === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
      else process.env.RATE_LIMIT_PER_MINUTE = prevLimit;
      await rl?.app.close();
    });

    it('RF-21: la peticion 11 de preview en un minuto responde 429', async () => {
      const data = csv([TEACHER_HEADER, [qa('rl1'), 'QA F4 Limite']]);
      for (let i = 0; i < 10; i++) {
        const res = await send(
          'rlAdmin',
          '/users/import/preview',
          { type: 'teachers', file: { name: 'r.csv', data } },
          rl.app,
        );
        expect(res.status, `preview ${i + 1}`).toBe(200);
      }
      const res = rec(
        await send(
          'rlAdmin',
          '/users/import/preview',
          { type: 'teachers', file: { name: 'r.csv', data } },
          rl.app,
        ),
      );
      expect(res.status).toBe(429);
    });

    it('RF-21: la peticion 11 de commit en un minuto responde 429', async () => {
      const data = csv([TEACHER_HEADER, [qa('rl2'), 'QA F4 Limite']]);
      const wrong = 'c'.repeat(64);
      for (let i = 0; i < 10; i++) {
        const res = await send(
          'rlAdmin',
          '/users/import/commit',
          { type: 'teachers', sha256: wrong, file: { name: 'r.csv', data } },
          rl.app,
        );
        expect(res.status, `commit ${i + 1}`).toBe(409);
      }
      const res = rec(
        await send(
          'rlAdmin',
          '/users/import/commit',
          { type: 'teachers', sha256: wrong, file: { name: 'r.csv', data } },
          rl.app,
        ),
      );
      expect(res.status).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Cierre', () => {
    it('RNF-09/RF-21: ninguna respuesta de import repite valores de celdas (ni correos ni nombres)', () => {
      expect(bodies.length).toBeGreaterThan(30);
      const forbidden = [
        '.example',
        'qa-f4',
        'QA F4',
        'ZZSENTINELA',
        'no-es-correo',
        'sin-arroba',
        'otro.example',
        'cmd|',
        'estudiante0',
        'docente01',
      ];
      for (const body of bodies) {
        for (const token of forbidden) {
          expect(body, `la respuesta repite "${token}"`).not.toContain(token);
        }
      }
    });

    it('RF-21: en toda la corrida hay exactamente un evento users.import.commit por cada 201', () => {
      const events = h.sink.records.filter((r) => r.action === 'users.import.commit');
      expect(successfulCommits).toBeGreaterThanOrEqual(7);
      expect(events).toHaveLength(successfulCommits);
      expect(h.sink.records.every((r) => r.action === 'users.import.commit')).toBe(true);
    });

    it('RF-21: tras limpiar los datos qa-f4-%, los conteos vuelven a los del seed', async () => {
      await cleanQaData();
      expect(await counts()).toEqual(baseline);
      expect(
        await prisma.user.count({ where: { institutionalEmail: { startsWith: QA_PREFIX } } }),
      ).toBe(0);
    });
  });
});
