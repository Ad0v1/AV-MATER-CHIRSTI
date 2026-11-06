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
import { loadEnv } from './../src/config/env.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { DniService } from './../src/modules/auth/dni.service.js';
import { PasswordService } from './../src/modules/auth/password.service.js';
import { MIB } from './../src/modules/users/import/import.constants.js';
import {
  buildZip,
  inlineCell,
  minimalParts,
  rawXlsx,
  unicodePathExtra,
} from './../src/modules/users/import/zip-builder.mock-spec.js';
import { MemoryAuditSink } from './helpers.js';

// RF-21: importacion masiva de usuarios (por DNI, D-058). Usa MySQL real con el seed cargado (solo
// local con Docker). Archivos generados en el test (sin binarios en el repo). Los usuarios que crea
// llevan DNI ficticios 91000001..91008000 y se limpian por su hash; las secciones 3A/3B del 2026
// son las del seed y la inactiva 3F se crea y se borra aqui.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const DOMAIN = 'colegio.example';
const QA_PREFIX = 'qa-f4-';
const INACTIVE_SECTION = 'F';

// DNI ficticios: los sueltos salen de una secuencia; los de las pruebas de 1000 filas, de un rango fijo.
const QA_DNI_BASE = 91_000_000;
const BULK_BASE = QA_DNI_BASE + 5_000;
const QA_DNI_COUNT = 8_000;
let dniSeq = 0;
const nd = () => String(QA_DNI_BASE + ++dniSeq);
const dniService = new DniService(loadEnv());
const qaDniHashes = () =>
  Array.from({ length: QA_DNI_COUNT }, (_, i) => dniService.hash(String(QA_DNI_BASE + i + 1)));

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cell = string | number | boolean | Date | Record<string, unknown>;

const STUDENT_HEADER = [
  'dni',
  'nombre_completo',
  'grado',
  'seccion',
  'dni_apoderado',
  'nombre_apoderado',
  'dni_apoderado_2',
  'nombre_apoderado_2',
];
const TEACHER_HEADER = ['dni', 'nombre_completo'];
const GUARDIAN_HEADER = ['dni_apoderado', 'nombre_apoderado', 'dni_estudiante'];

/** Fila de estudiante: los apoderados van al final y son opcionales en el helper. */
const stu = (
  dni: string,
  name: string,
  grade: string | number,
  section: string,
  g1: string,
  g1Name = '',
  g2 = '',
  g2Name = '',
) => [dni, name, String(grade), section, g1, g1Name, g2, g2Name];

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
    .useValue(sink);
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

  // Personas que ya existen antes de importar (se crean por Prisma, con DNI cifrado).
  const fx = {
    student: { dni: nd(), id: '' }, // estudiante activo
    withdrawn: { dni: nd(), id: '' }, // estudiante retirado
    teacher: { dni: nd(), id: '' },
    guardian: { dni: nd(), id: '', name: 'QA F4 Apoderado Existente' },
    guardianOut: { dni: nd(), id: '' }, // apoderado retirado
    kids: [] as Array<{ dni: string; id: string }>, // 11 estudiantes para TOO_MANY_STUDENTS
  };

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
  // Las respuestas del commit llevan la hoja de credenciales (base64); no se guarda en `bodies`
  // porque ahi se busca que no se repitan valores de celdas.
  const rec = (res: request.Response) => {
    const body = res.body as Json;
    bodies.push(JSON.stringify({ ...body, credentialsSheet: undefined }));
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
  const byDni = (dni: string) =>
    prisma.user.findUniqueOrThrow({ where: { dniHash: dniService.hash(dni) } });
  const sheetOf = async (res: request.Response) => {
    const sheet = res.body.credentialsSheet as Json;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(sheet.base64, 'base64') as unknown as ExcelJS.Buffer);
    const rows: string[][] = [];
    wb.getWorksheet('Credenciales')!.eachRow((row, n) => {
      if (n > 1) rows.push((row.values as unknown[]).slice(1).map(String));
    });
    return { sheet, rows };
  };

  const counts = async () => ({
    years: await prisma.academicYear.count(),
    sections: await prisma.section.count(),
    users: await prisma.user.count(),
    credentials: await prisma.localCredential.count(),
    enrollments: await prisma.enrollment.count(),
    links: await prisma.guardianStudent.count(),
    courses: await prisma.course.count(),
    courseSections: await prisma.courseSection.count(),
  });

  const cleanQaData = async () => {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ email: { startsWith: QA_PREFIX } }, { dniHash: { in: qaDniHashes() } }],
      },
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

  const makeUser = (
    dni: string,
    fullName: string,
    role: Role,
    status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN' = 'ACTIVE',
    email?: string,
  ) =>
    prisma.user.create({
      data: {
        fullName,
        role,
        status,
        dniEncrypted: dniService.encrypt(dni),
        dniHash: dniService.hash(dni),
        email: email,
      },
    });

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
    const inactiveAdmin = await makeUser(
      nd(),
      'QA F4 Admin Inactivo',
      'ADMIN',
      'INACTIVE',
      `${QA_PREFIX}admin-inactivo@${DOMAIN}`,
    );
    fx.student.id = (await makeUser(fx.student.dni, 'QA F4 Estudiante Existente', 'STUDENT')).id;
    fx.withdrawn.id = (
      await makeUser(fx.withdrawn.dni, 'QA F4 Retirado', 'STUDENT', 'WITHDRAWN')
    ).id;
    fx.teacher.id = (await makeUser(fx.teacher.dni, 'QA F4 Docente Existente', 'TEACHER')).id;
    fx.guardian.id = (await makeUser(fx.guardian.dni, fx.guardian.name, 'GUARDIAN')).id;
    fx.guardianOut.id = (
      await makeUser(fx.guardianOut.dni, 'QA F4 Apoderado Retirado', 'GUARDIAN', 'WITHDRAWN')
    ).id;
    for (let i = 0; i < 11; i++) {
      const dni = nd();
      fx.kids.push({ dni, id: (await makeUser(dni, `QA F4 Hijo ${i + 1}`, 'STUDENT')).id });
    }

    h = await buildApp({ throttle: false });
    for (const key of ['admin', 'docente01', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@${DOMAIN}` },
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
    const tiny = { name: 'a.csv', data: csv([TEACHER_HEADER, [nd(), 'QA F4 Auth']]) };
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
        const cases: [string, string[]][] = [
          ['teachers', [nd(), 'QA F4 Round Docente']],
          ['students', stu(nd(), 'QA F4 Round Estudiante', 3, 'A', nd(), 'QA F4 Round Apoderado')],
          ['guardians', [nd(), 'QA F4 Round Apoderado', fx.student.dni]],
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
  describe('Estudiantes: preview y commit (RF-21, RF-76, RF-86)', () => {
    const s1 = nd();
    const s2 = nd();
    const g1 = nd(); // apoderado nuevo compartido por los dos hermanos
    const g2 = nd(); // segundo apoderado nuevo del estudiante 2
    const file = csv([
      STUDENT_HEADER,
      stu(s1, 'QA F4  Estudiante   Uno', 3, 'a', g1, 'QA F4 Apoderado Compartido'), // seccion en minuscula
      stu(s2, 'QA F4 Estudiante Dos', 3, 'B', g1, '', g2, 'QA F4 Segundo Apoderado'),
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
        // 2 alumnos + 2 apoderados nuevos; 2 matriculas; 3 vinculos.
        summary: { users: 4, enrollments: 2, links: 3 },
        canConfirm: true,
      });
      expect(await counts()).toEqual(before);
    });

    it('RF-21/RF-76: commit crea cuentas con contraseña inicial, matriculas y vinculos, y devuelve la hoja', async () => {
      const before = await counts();
      const res = await commit('students', 'estudiantes.csv', file);
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('students');
      expect(res.body.created).toEqual({ users: 4, enrollments: 2, links: 3 });
      const after = await counts();
      expect(after.users).toBe(before.users + 4);
      expect(after.credentials).toBe(before.credentials + 4);
      expect(after.enrollments).toBe(before.enrollments + 2);
      expect(after.links).toBe(before.links + 3);

      const u1 = await byDni(s1);
      expect(u1).toMatchObject({
        role: 'STUDENT',
        status: 'ACTIVE',
        fullName: 'QA F4 Estudiante Uno',
      });
      expect(u1.code).toMatch(/^\d{10}$/);
      expect(u1.dniEncrypted).not.toContain(s1);
      expect(dniService.decrypt(u1.dniEncrypted!)).toBe(s1);
      const e1 = await prisma.enrollment.findMany({ where: { studentId: u1.id } });
      expect(e1).toHaveLength(1);
      expect(e1[0]).toMatchObject({ sectionId: sec3A, academicYearId: yearId, isCurrent: true });
      const u2 = await byDni(s2);
      const e2 = await prisma.enrollment.findFirstOrThrow({ where: { studentId: u2.id } });
      expect(e2).toMatchObject({ sectionId: sec3B, academicYearId: yearId, isCurrent: true });

      // El primer apoderado es el principal de cada hijo; el segundo, no.
      const guardian1 = await byDni(g1);
      const guardian2 = await byDni(g2);
      expect(guardian1.role).toBe('GUARDIAN');
      const links = await prisma.guardianStudent.findMany({
        where: { studentId: { in: [u1.id, u2.id] } },
      });
      const key = (l: (typeof links)[number]) => `${l.studentId}:${l.guardianId}:${l.isPrimary}`;
      expect(links.map(key).sort()).toEqual(
        [
          `${u1.id}:${guardian1.id}:true`,
          `${u2.id}:${guardian1.id}:true`,
          `${u2.id}:${guardian2.id}:null`,
        ].sort(),
      );

      // Cada cuenta debe cambiar la clave al entrar y la de la hoja es la guardada.
      const creds = await prisma.localCredential.findMany({
        where: { userId: { in: [u1.id, u2.id, guardian1.id, guardian2.id] } },
      });
      expect(creds).toHaveLength(4);
      expect(creds.every((c) => c.mustChangePassword)).toBe(true);
      const { sheet, rows } = await sheetOf(res);
      expect(sheet.filename).toMatch(/^credenciales-students-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(sheet.contentType).toContain('spreadsheetml');
      expect(rows).toHaveLength(4);
      const passwords = new PasswordService();
      const row = rows.find((r) => r[1] === 'QA F4 Estudiante Uno')!;
      expect(row[0]).toBe('Estudiante');
      expect(row[2]).toBe('3.º A');
      expect(row[3]).toBe(u1.code);
      const cred = creds.find((c) => c.userId === u1.id)!;
      expect(await passwords.verify(cred.passwordHash, row[4])).toBe(true);
      // Ni el DNI ni los codigos de otros salen en la hoja.
      expect(JSON.stringify(rows)).not.toContain(s1);
    });

    it('RF-21: repetir el mismo archivo responde 422 DNI_TAKEN sin cambiar nada', async () => {
      const before = await counts();
      const pre = await preview('students', 'estudiantes.csv', file);
      expect(pre.status).toBe(200);
      // Los apoderados ya existen y se reutilizan; lo repetido son los alumnos.
      expect(codes(pre)).toEqual(['2:dni:DNI_TAKEN', '3:dni:DNI_TAKEN']);
      expect(pre.body.canConfirm).toBe(false);
      const res = await commit('students', 'estudiantes.csv', file);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(detailCodes(res)).toEqual(['2:dni:DNI_TAKEN', '3:dni:DNI_TAKEN']);
      expect(await counts()).toEqual(before);
    });

    it('RF-21: un alumno nuevo con un apoderado que ya existe lo reutiliza (sin cuenta nueva para el)', async () => {
      const sNew = nd();
      const data = csv([
        STUDENT_HEADER,
        stu(sNew, 'QA F4 Estudiante Reutiliza', 3, 'A', fx.guardian.dni),
      ]);
      const before = await counts();
      const res = await commit('students', 'reutiliza.csv', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 1, enrollments: 1, links: 1 });
      expect(await counts()).toMatchObject({ users: before.users + 1, links: before.links + 1 });
      const link = await prisma.guardianStudent.findFirstOrThrow({
        where: { studentId: (await byDni(sNew)).id },
      });
      expect(link).toMatchObject({ guardianId: fx.guardian.id, isPrimary: true, isActive: true });
      const { rows } = await sheetOf(res);
      expect(rows.map((r) => r[0])).toEqual(['Estudiante']);
    });

    it('RF-21: CSV con ";" y BOM, tildes y eñes; el commit conserva el nombre', async () => {
      const dniA = nd();
      const data = csv(
        [
          STUDENT_HEADER,
          stu(dniA, 'QA F4 Ñandú Pérez', 3, 'A', nd(), 'QA F4 Apoderado Ñ'),
          stu(nd(), 'QA F4 Ibáñez', 3, 'B', nd(), 'QA F4 Apoderado I'),
        ],
        { sep: ';', bom: true, eol: '\r\n' },
      );
      const pre = await preview('students', 'excel-es.csv', data);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({ totalRows: 2, validRows: 2, canConfirm: true });
      const res = await commit('students', 'excel-es.csv', data);
      expect(res.status).toBe(201);
      expect((await byDni(dniA)).fullName).toBe('QA F4 Ñandú Pérez');
    });

    it('RF-21: campo entre comillas con coma, encabezados con tildes y en otro orden', async () => {
      const data = Buffer.from(
        'Sección,Grado,"Nombre Completo",DNI,DNI Apoderado,Nombre Apoderado,DNI Apoderado 2,Nombre Apoderado 2\n' +
          `A,3,"QA F4 Pérez, Ana",${nd()},${nd()},"QA F4 Apoderado, Pérez",,\n` +
          '\n',
        'utf8',
      );
      const res = await preview('students', 'otro-orden.csv', data);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalRows: 1, validRows: 1, canConfirm: true });
    });

    it('RF-21: las filas vacias se ignoran y el numero de fila es el fisico', async () => {
      const data = Buffer.from(
        `${STUDENT_HEADER.join(',')}\n,,,,,,,\n\n${nd()},ab,3,A,${nd()},QA F4 Apo\n`,
        'utf8',
      );
      const res = await preview('students', 'vacias.csv', data);
      expect(res.status).toBe(200);
      expect(res.body.totalRows).toBe(1);
      expect(codes(res)).toEqual(['4:nombre_completo:INVALID_NAME']);
    });

    it('RF-21: preview y commit XLSX de estudiantes (DNI y grado como numeros)', async () => {
      const dniA = Number(nd());
      const data = await xlsx([
        STUDENT_HEADER,
        [dniA, 'QA F4 Estudiante Siete', 3, 'A', Number(nd()), 'QA F4 Apoderado Siete', '', ''],
      ]);
      const pre = await preview('students', 'estudiantes.xlsx', data);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({ format: 'xlsx', validRows: 1, canConfirm: true });
      const res = await commit('students', 'estudiantes.xlsx', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 2, enrollments: 1, links: 1 });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Docentes: preview y commit (RF-21, RF-22, RF-76)', () => {
    it('RF-21/RF-22: preview y commit de docentes en XLSX, con hoja de credenciales', async () => {
      const t1 = nd();
      const data = await xlsx([
        TEACHER_HEADER,
        [t1, 'QA F4 Docente Uno'],
        [nd(), 'QA F4 Docente Dos'],
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
      const u = await byDni(t1);
      expect(u).toMatchObject({ role: 'TEACHER', status: 'ACTIVE' });
      const cred = await prisma.localCredential.findUniqueOrThrow({ where: { userId: u.id } });
      expect(cred.mustChangePassword).toBe(true);
      const { rows } = await sheetOf(res);
      expect(rows.map((r) => r[0])).toEqual(['Docente', 'Docente']);
    });

    it('RF-21: DNI mal formado (con letras, de 7 o de 9 digitos) → INVALID_DNI', async () => {
      const data = csv([
        TEACHER_HEADER,
        ['1234567', 'QA F4 Docente Tres'],
        ['123456789', 'QA F4 Docente Cuatro'],
        ['12ab5678', 'QA F4 Docente Cinco'],
      ]);
      const res = await preview('teachers', 'dom.csv', data);
      expect(codes(res)).toEqual(['2:dni:INVALID_DNI', '3:dni:INVALID_DNI', '4:dni:INVALID_DNI']);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Apoderados: preview y commit (RF-21, RF-20, RF-86)', () => {
    it('RF-21/RF-86: apoderado nuevo con 2 hijos: preview y commit con hoja de credenciales', async () => {
      const gNew = nd();
      const [k1, k2] = fx.kids;
      const data = csv(
        [
          GUARDIAN_HEADER,
          [gNew, 'QA F4 Apoderado Uno', k1.dni],
          [gNew, 'QA F4 Apoderado Uno', k2.dni],
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

      const g = await byDni(gNew);
      expect(g).toMatchObject({ role: 'GUARDIAN', status: 'ACTIVE' });
      const links = await prisma.guardianStudent.findMany({ where: { guardianId: g.id } });
      expect(links.every((l) => l.isActive && l.isPrimary === true)).toBe(true);
      expect(links.map((l) => l.studentId).sort()).toEqual([k1.id, k2.id].sort());
      const { rows } = await sheetOf(res);
      expect(rows.map((r) => r[0])).toEqual(['Apoderado']);
    });

    it('RF-21: vincular un apoderado que ya existe no crea cuentas ni hoja de credenciales', async () => {
      const k = fx.kids[2];
      const data = csv([GUARDIAN_HEADER, [fx.guardian.dni, '', k.dni]]);
      const res = await commit('guardians', 'existente.csv', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 0, enrollments: 0, links: 1 });
      expect(res.body.credentialsSheet).toBeNull();
      const link = await prisma.guardianStudent.findFirstOrThrow({
        where: { studentId: k.id, guardianId: fx.guardian.id },
      });
      expect(link.isPrimary).toBe(true);
    });

    it('RF-21: apoderado XLSX con un hijo', async () => {
      const data = await xlsx([
        GUARDIAN_HEADER,
        [Number(nd()), 'QA F4 Apoderado Tres', Number(fx.kids[3].dni)],
      ]);
      const res = await commit('guardians', 'g.xlsx', data);
      expect(res.status).toBe(201);
      expect(res.body.created).toEqual({ users: 1, enrollments: 0, links: 1 });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Codigos de error por fila (RF-21)', () => {
    it('RF-21: students: todos los codigos de fila del CSV, con fila y columna', async () => {
      const long = 'N'.repeat(501);
      const dup = nd();
      const ok = (name: string) => stu(nd(), name, 3, 'A', nd(), 'QA F4 Apoderado Valido');
      const data = csv([
        STUDENT_HEADER,
        stu('', 'QA F4 Uno', 3, 'A', nd(), 'QA F4 Apo'), // 2 REQUIRED
        stu('no-es-dni', 'QA F4 Dos', 3, 'A', nd(), 'QA F4 Apo'), // 3 INVALID_DNI
        stu(nd(), 'ab', 3, 'A', nd(), 'QA F4 Apo'), // 4 INVALID_NAME
        stu(nd(), '=cmd|ZZSENTINELA', 3, 'A', nd(), 'QA F4 Apo'), // 5 INVALID_NAME (formula)
        stu(nd(), 'QA F4 Grado', 9, 'A', nd(), 'QA F4 Apo'), // 6 INVALID_GRADE
        stu(nd(), 'QA F4 Seccion', 3, '!!', nd(), 'QA F4 Apo'), // 7 INVALID_SECTION
        stu(nd(), 'QA F4 Sin Seccion', 3, 'Z', nd(), 'QA F4 Apo'), // 8 SECTION_NOT_FOUND
        stu(nd(), 'QA F4 Seccion Inactiva', 3, INACTIVE_SECTION, nd(), 'QA F4 Apo'), // 9 SECTION_INACTIVE
        stu(dup, 'QA F4 Duplicado', 3, 'A', nd(), 'QA F4 Apo'), // 10 valida
        stu(dup, 'QA F4 Duplicado', 3, 'A', nd(), 'QA F4 Apo'), // 11 DUPLICATE_IN_FILE
        stu(fx.student.dni, 'QA F4 Ocupado', 3, 'A', nd(), 'QA F4 Apo'), // 12 DNI_TAKEN
        [...ok('QA F4 Extra'), 'sobra'], // 13 EXTRA_CELLS
        stu(nd(), long, 3, 'A', nd(), 'QA F4 Apo'), // 14 TOO_LONG
        ok('QA F4 Valido'), // 15 valida
      ]);
      const res = await preview('students', 'codigos.csv', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '2:dni:REQUIRED',
        '3:dni:INVALID_DNI',
        '4:nombre_completo:INVALID_NAME',
        '5:nombre_completo:INVALID_NAME',
        '6:grado:INVALID_GRADE',
        '7:seccion:INVALID_SECTION',
        '8:seccion:SECTION_NOT_FOUND',
        '9:seccion:SECTION_INACTIVE',
        '11:dni:DUPLICATE_IN_FILE',
        '12:dni:DNI_TAKEN',
        '13:null:EXTRA_CELLS',
        '14:nombre_completo:TOO_LONG',
      ]);
      expect(res.body).toMatchObject({
        totalRows: 14,
        validRows: 2,
        errorRows: 12,
        errorsTruncated: false,
        canConfirm: false,
      });
      const dupErr = (res.body.errors as Json[]).find((e) => e.code === 'DUPLICATE_IN_FILE')!;
      expect(dupErr.message).toContain('fila 10');
      for (const e of res.body.errors as Json[]) {
        expect(typeof e.message).toBe('string');
        expect(e.message.length).toBeGreaterThan(0);
      }
    });

    it('RF-21: students: reglas de los apoderados del alumno', async () => {
      const gNew = nd();
      const data = csv([
        STUDENT_HEADER,
        stu(nd(), 'QA F4 Sin Apoderado', 3, 'A', ''), // 2 REQUIRED dni_apoderado
        stu(nd(), 'QA F4 Apoderado Sin Nombre', 3, 'A', nd()), // 3 GUARDIAN_NAME_REQUIRED
        stu(nd(), 'QA F4 Apoderado Docente', 3, 'A', fx.teacher.dni), // 4 NOT_GUARDIAN
        stu(nd(), 'QA F4 Apoderado Retirado', 3, 'A', fx.guardianOut.dni), // 5 GUARDIAN_WITHDRAWN
        stu(nd(), 'QA F4 Mismo Apoderado', 3, 'A', gNew, 'QA F4 Apo', gNew, 'QA F4 Apo'), // 6 DUPLICATE_GUARDIAN
        stu(nd(), 'QA F4 Apoderado Mal Dni', 3, 'A', 'xx'), // 7 INVALID_DNI
        stu(nd(), 'QA F4 Segundo Sin Nombre', 3, 'A', gNew, 'QA F4 Apo', nd()), // 8 GUARDIAN_NAME_REQUIRED (2)
      ]);
      const res = await preview('students', 'apoderados.csv', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '2:dni_apoderado:REQUIRED',
        '3:dni_apoderado:GUARDIAN_NAME_REQUIRED',
        '4:dni_apoderado:NOT_GUARDIAN',
        '5:dni_apoderado:GUARDIAN_WITHDRAWN',
        '6:dni_apoderado_2:DUPLICATE_GUARDIAN',
        '7:dni_apoderado:INVALID_DNI',
        '8:dni_apoderado_2:GUARDIAN_NAME_REQUIRED',
      ]);
    });

    it('RF-21: teachers: REQUIRED, INVALID_DNI, DUPLICATE_IN_FILE y DNI_TAKEN', async () => {
      const t11 = nd();
      const data = csv([
        TEACHER_HEADER,
        [nd(), ''], // 2 REQUIRED
        ['sin-dni', 'QA F4 Docente'], // 3 INVALID_DNI
        [t11, 'QA F4 Docente Once'], // 4 valida
        [t11, 'QA F4 Docente Once'], // 5 DUPLICATE_IN_FILE
        [fx.teacher.dni, 'QA F4 Ocupado'], // 6 DNI_TAKEN
      ]);
      const res = await preview('teachers', 'd.csv', data);
      expect(codes(res)).toEqual([
        '2:nombre_completo:REQUIRED',
        '3:dni:INVALID_DNI',
        '5:dni:DUPLICATE_IN_FILE',
        '6:dni:DNI_TAKEN',
      ]);
    });

    it('RF-21: guardians: todos los codigos de fila', async () => {
      const ga = nd();
      const [k1, k2] = fx.kids;
      const [k3, k4] = fx.kids.slice(5);
      const data = csv([
        GUARDIAN_HEADER,
        [ga, 'QA F4 Apo A', k1.dni], // 2 valida
        [ga, 'QA F4 Apo A', k1.dni], // 3 DUPLICATE_LINK
        [ga, 'QA F4 Otro Nombre', k2.dni], // 4 NAME_MISMATCH
        [fx.student.dni, 'QA F4 Apo B', fx.student.dni], // 5 SAME_PERSON
        [nd(), 'QA F4 Apo C', nd()], // 6 STUDENT_NOT_FOUND
        [nd(), 'QA F4 Apo D', fx.teacher.dni], // 7 NOT_STUDENT
        [nd(), 'QA F4 Apo E', fx.withdrawn.dni], // 8 STUDENT_WITHDRAWN
        [fx.teacher.dni, 'QA F4 Apo F', k3.dni], // 9 NOT_GUARDIAN
        [fx.guardianOut.dni, 'QA F4 Apo G', k3.dni], // 10 GUARDIAN_WITHDRAWN
        [nd(), '', k4.dni], // 11 GUARDIAN_NAME_REQUIRED
        [nd(), 'QA F4 Apo H', 'no-es-dni'], // 12 INVALID_DNI
      ]);
      const res = await preview('guardians', 'g.csv', data);
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual([
        '3:dni_estudiante:DUPLICATE_LINK',
        '4:nombre_apoderado:NAME_MISMATCH',
        '5:dni_estudiante:SAME_PERSON',
        '6:dni_estudiante:STUDENT_NOT_FOUND',
        '7:dni_estudiante:NOT_STUDENT',
        '8:dni_estudiante:STUDENT_WITHDRAWN',
        '9:dni_apoderado:NOT_GUARDIAN',
        '10:dni_apoderado:GUARDIAN_WITHDRAWN',
        '11:dni_apoderado:GUARDIAN_NAME_REQUIRED',
        '12:dni_estudiante:INVALID_DNI',
      ]);
      expect(res.body.summary).toEqual({ users: 1, enrollments: 0, links: 1 });
    });

    it('RF-21: guardians: el hijo 11 de un apoderado → TOO_MANY_STUDENTS', async () => {
      const gm = nd();
      const rows = fx.kids.map((k) => [gm, 'QA F4 Apo Muchos', k.dni]);
      const res = await preview('guardians', 'muchos.csv', csv([GUARDIAN_HEADER, ...rows]));
      expect(codes(res)).toEqual(['12:dni_estudiante:TOO_MANY_STUDENTS']);
      expect(res.body.summary).toEqual({ users: 1, enrollments: 0, links: 10 });
    });

    it('RF-21: guardians: un estudiante con 2 apoderados no admite otro → MAX_GUARDIANS (preview y commit)', async () => {
      const kid = fx.kids[9];
      const data1 = csv([
        GUARDIAN_HEADER,
        [nd(), 'QA F4 Apoderado Uno', kid.dni],
        [nd(), 'QA F4 Apoderado Dos', kid.dni],
        [nd(), 'QA F4 Apoderado Tres', kid.dni],
      ]);
      const pre = await preview('guardians', 'max.csv', data1);
      expect(codes(pre)).toEqual(['4:dni_estudiante:MAX_GUARDIANS']);
      const res = await commit('guardians', 'max.csv', data1);
      expect(res.status).toBe(422);
      expect(detailCodes(res)).toEqual(['4:dni_estudiante:MAX_GUARDIANS']);
    });

    it('RF-21: errorsTruncated: mas de 500 errores se devuelven recortados', async () => {
      const rows = Array.from({ length: 600 }, (_, i) =>
        stu(`malo${i}`, 'QA F4 Truncado', 3, 'A', nd().slice(0, 8), 'QA F4 Apo'),
      );
      const res = await preview('students', 'truncado.csv', csv([STUDENT_HEADER, ...rows]));
      expect(res.status).toBe(200);
      expect(res.body.errors).toHaveLength(500);
      expect(res.body).toMatchObject({ errorsTruncated: true, errorRows: 600, canConfirm: false });
    });
  });

  // ---------------------------------------------------------------------------------------
  describe('Archivo, formato y limites (RF-21, RNF-09)', () => {
    const okRow = [nd(), 'QA F4 Limite'];

    it('RF-21: 1000 filas es el maximo valido; 1001 responde 400', async () => {
      const mk = (n: number) =>
        csv([
          TEACHER_HEADER,
          ...Array.from({ length: n }, (_, i) => [String(BULK_BASE + i), 'QA F4 Masivo']),
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
      const header = `${TEACHER_HEADER.join(',')}\n${nd()},QA F4 Fisico\n`;
      const csv5000 = Buffer.from(header + '\n'.repeat(4998)); // 5000 lineas fisicas
      const csv5001 = Buffer.from(header + '\n'.repeat(4999));
      expect((await preview('teachers', 'fis5000.csv', csv5000)).status).toBe(200);
      const bad = await preview('teachers', 'fis5001.csv', csv5001);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
      const head = `<row r="1">${inlineCell('A1', 'dni')}${inlineCell('B1', 'nombre_completo')}</row>`;
      const xl = (empty: number) =>
        rawXlsx(
          `<sheetData>${head}<row r="2">${inlineCell('A2', nd())}${inlineCell('B2', 'QA F4 Fisico')}</row>` +
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
        Buffer.from(`${TEACHER_HEADER.join(',')}\n${nd()},QA F4 Jos`),
        Buffer.from([0xe9]),
        Buffer.from('\n'),
      ]);
      expect((await preview('teachers', 'latin1.csv', latin1)).status).toBe(400);
      const quote = Buffer.from(`${TEACHER_HEADER.join(',')}\n${nd()},"QA F4 sin cerrar\n`);
      expect((await preview('teachers', 'comilla.csv', quote)).status).toBe(400);
      const nul = Buffer.from(`${TEACHER_HEADER.join(',')}\n${nd()},QA F4\u0000X\n`);
      expect((await preview('teachers', 'nul.csv', nul)).status).toBe(415);
    });

    it('RF-21: encabezados invalidos (faltante, desconocido, repetido) y sin filas → 400', async () => {
      const cases: Buffer[] = [
        csv([['dni'], [nd()]]),
        csv([
          [...TEACHER_HEADER, 'extra'],
          [nd(), 'QA F4 Nombre', 'x'],
        ]),
        csv([
          ['dni', 'dni', 'nombre_completo'],
          [nd(), nd(), 'QA F4 Nombre'],
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
      const t = nd();
      const data = csv([TEACHER_HEADER, [t, 'QA F4 Hash Uno']]);
      const other = csv([TEACHER_HEADER, [t, 'QA F4 Hash Otro']]);
      const before = await counts();
      const res = await commit('teachers', 'h.csv', data, sha256(other));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(await counts()).toEqual(before);
    });

    it('RF-21: commit con errores de archivo responde 422 con details y no cambia los conteos', async () => {
      const t = nd();
      const data = csv([TEACHER_HEADER, [t, 'QA F4 Valido'], ['malo', 'QA F4 Invalido']]);
      const before = await counts();
      const res = await commit('teachers', 'e.csv', data);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(detailCodes(res)).toEqual(['3:dni:INVALID_DNI']);
      expect(await counts()).toEqual(before);
      expect(await prisma.user.count({ where: { dniHash: dniService.hash(t) } })).toBe(0);
    });

    it('RF-21: todo o nada: una fila ocupada en la BD impide crear las demas (422)', async () => {
      const t = nd();
      const data = csv([
        STUDENT_HEADER,
        stu(t, 'QA F4 Todo Nada', 3, 'A', nd(), 'QA F4 Apo'),
        stu(fx.student.dni, 'QA F4 Ocupado', 3, 'A', nd(), 'QA F4 Apo'),
      ]);
      const before = await counts();
      const res = await commit('students', 'tn.csv', data);
      expect(res.status).toBe(422);
      expect(detailCodes(res)).toEqual(['3:dni:DNI_TAKEN']);
      expect(await counts()).toEqual(before);
    });

    it('RF-21: seccion inactiva o inexistente en el commit → 422 sin escribir', async () => {
      const data = csv([
        STUDENT_HEADER,
        stu(nd(), 'QA F4 Inactiva', 3, INACTIVE_SECTION, nd(), 'QA F4 Apo'),
        stu(nd(), 'QA F4 Inexistente', 3, 'Z', nd(), 'QA F4 Apo'),
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
        [nd(), 'QA F4 Paralelo Uno'],
        [nd(), 'QA F4 Paralelo Dos'],
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
      // Carrera de unicidad (P2002 sobre el hash del DNI) → 409; si el segundo ya ve el DNI → 422.
      expect(statuses[0]).toBe(201);
      expect([409, 422]).toContain(statuses[1]);
      const after = await counts();
      expect(after.users).toBe(before.users + 2);
      expect(after.credentials).toBe(before.credentials + 2);
    });

    it('RF-76: 1000 docentes se importan en una sola transaccion dentro del tiempo permitido', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => [
        String(BULK_BASE + i),
        `QA F4 Masivo ${i}`,
      ]);
      const data = csv([TEACHER_HEADER, ...rows]);
      const before = await counts();
      const started = Date.now();
      const res = await commit('teachers', 'mil.csv', data);
      expect(res.status).toBe(201);
      expect(Date.now() - started).toBeLessThan(20_000);
      expect(res.body.created.users).toBe(1000);
      expect((await counts()).users).toBe(before.users + 1000);
      expect((await sheetOf(res)).rows).toHaveLength(1000);
      // Codigos distintos entre si.
      const created = await prisma.user.findMany({
        where: { dniHash: { in: rows.map((r) => dniService.hash(r[0])) } },
        select: { code: true },
      });
      expect(new Set(created.map((u) => u.code)).size).toBe(1000);
    }, 120_000);
  });

  // ---------------------------------------------------------------------------------------
  describe('Bitacora sin datos personales (RF-21, RNF-09/11, D-024)', () => {
    it('RF-21: un unico evento users.import.commit por importacion confirmada, sin DNI ni nombres', async () => {
      const a = nd();
      const b = nd();
      const g = nd();
      const data = csv([
        STUDENT_HEADER,
        stu(a, 'QA F4 Auditoria Uno', 3, 'A', g, 'QA F4 Auditoria Apo'),
        stu(b, 'QA F4 Auditoria Dos', 3, 'B', g),
      ]);
      const start = h.sink.records.length;
      // un preview, un commit rechazado (hash) y uno fallido (422) no registran nada
      await preview('students', 'au.csv', data);
      await commit('students', 'au.csv', data, 'b'.repeat(64));
      await commit(
        'students',
        'au.csv',
        csv([STUDENT_HEADER, stu('malo', 'QA F4 Mal', 3, 'A', nd(), 'QA F4 Apo')]),
      );
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
        usersCreated: 3,
        enrollmentsCreated: 2,
        linksCreated: 2,
      });
      expect(after.userIds).toHaveLength(3);
      const created = await prisma.user.findMany({
        where: { dniHash: { in: [a, b, g].map((d) => dniService.hash(d)) } },
        select: { id: true },
      });
      expect((after.userIds as string[]).sort()).toEqual(created.map((u) => u.id).sort());
      const dump = JSON.stringify(ev);
      for (const secret of [a, b, g, 'QA F4', '@', QA_PREFIX]) expect(dump).not.toContain(secret);
      // Ni la contraseña inicial ni el codigo de ninguna cuenta nueva.
      const { rows } = await sheetOf(res);
      for (const row of rows) {
        expect(dump).not.toContain(row[3]);
        expect(dump).not.toContain(row[4]);
      }
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
        where: { email: `admin@${DOMAIN}` },
      });
      cookies.set('rlAdmin', await rl.sessions.create({ id: admin.id, role: 'ADMIN' }));
    });

    afterAll(async () => {
      if (prevLimit === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
      else process.env.RATE_LIMIT_PER_MINUTE = prevLimit;
      await rl?.app.close();
    });

    it('RF-21: la peticion 11 de preview en un minuto responde 429', async () => {
      const data = csv([TEACHER_HEADER, [nd(), 'QA F4 Limite']]);
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
      const data = csv([TEACHER_HEADER, [nd(), 'QA F4 Limite']]);
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
    it('RNF-09/RF-21: ninguna respuesta de import repite valores de celdas (ni DNI ni nombres)', () => {
      expect(bodies.length).toBeGreaterThan(30);
      const forbidden = [
        'qa-f4',
        'QA F4',
        'ZZSENTINELA',
        'no-es-dni',
        'sin-dni',
        'cmd|',
        'estudiante0',
        'docente01',
        String(QA_DNI_BASE).slice(0, 5) + '0', // 91000...: ningun DNI de prueba
      ];
      for (const body of bodies) {
        for (const token of forbidden) {
          expect(body, `la respuesta repite "${token}"`).not.toContain(token);
        }
      }
    });

    it('RF-21: en toda la corrida hay exactamente un evento users.import.commit por cada 201', () => {
      const events = h.sink.records.filter((r) => r.action === 'users.import.commit');
      expect(successfulCommits).toBeGreaterThanOrEqual(8);
      expect(events).toHaveLength(successfulCommits);
      expect(h.sink.records.every((r) => r.action === 'users.import.commit')).toBe(true);
    });

    it('RF-21: tras limpiar los datos de prueba, los conteos vuelven a los del seed', async () => {
      await cleanQaData();
      expect(await counts()).toEqual(baseline);
      expect(await prisma.user.count({ where: { dniHash: { in: qaDniHashes() } } })).toBe(0);
    });
  });
});
