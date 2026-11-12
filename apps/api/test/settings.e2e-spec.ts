import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { FileScanner } from './../src/modules/files/file-scanner.js';
import { jpegBytes, pngBytes } from './../src/modules/settings/logo-fixtures.mock-spec.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// Fase 5c de Dev 5 (RF-61, U5, U11): configuración institucional con MySQL, MinIO y ClamAV reales
// de Docker (solo local). Cambia la fila única InstitutionSettings id = 1 y la deja como estaba al
// final; borra los logos que sube. El registro usa 3.° A Ciencia y Tecnología (docente03).
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
const TITLE_PREFIX = 'QA-5C ';
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const DEFAULT_SCALE = [
  { literal: 'AD', min: 18, max: 20 },
  { literal: 'A', min: 14, max: 17 },
  { literal: 'B', min: 11, max: 13 },
  { literal: 'C', min: 0, max: 10 },
];
const CUSTOM_SCALE = [
  { literal: 'AD', min: 17, max: 20 },
  { literal: 'A', min: 14, max: 16 },
  { literal: 'B', min: 11, max: 13 },
  { literal: 'X', min: 0, max: 10 },
];

type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';

describe.skipIf(!process.env.DATABASE_URL)('Configuración institucional 5c (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let sink: MemoryAuditSink;
  let original: Awaited<ReturnType<PrismaClient['institutionSettings']['findUniqueOrThrow']>>;
  let cs3A: string;
  let section3A: string;
  let period4: string;
  const ids = new Map<string, string>();
  const cookies = new Map<string, string>();
  const createdKeys = new Set<string>();

  const http = () => request(app.getHttpServer());
  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const get = (key: string | null, url: string) => {
    const req = http().get(API + url);
    return key ? req.set('Cookie', as(key)) : req;
  };
  const put = (key: string | null, body: object) => {
    const req = http().put(`${API}/admin/settings`);
    if (key) req.set('Cookie', as(key));
    return req.send(body);
  };
  const putLogo = (key: string | null, content: Buffer, name = 'logo.png', type = 'image/png') => {
    const req = http().put(`${API}/admin/settings/logo`);
    if (key) req.set('Cookie', as(key));
    return req.attach('file', content, { filename: name, contentType: type });
  };
  const row = () => prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
  const exists = async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  };
  const body = (over: object = {}) => ({
    name: original.name,
    literalScale: DEFAULT_SCALE,
    purgeAfterDays: original.purgeAfterDays,
    ...over,
  });
  /** Tarea y nota de prueba (se borran siempre: primero las notas, luego la tarea). */
  const cleanQa = async () => {
    const assignmentIds = (
      await prisma.assignment.findMany({
        where: { title: { startsWith: TITLE_PREFIX } },
        select: { id: true },
      })
    ).map((a) => a.id);
    await prisma.grade.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
    await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
  };
  const auditOf = (action: string) => sink.records.filter((r) => r.action === action);

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
    original = await row();
    const storage = loadStorageConfig();
    bucket = storage.bucket;
    s3 = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    });
    const y2026 = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2026 } });
    const cs = await prisma.courseSection.findFirstOrThrow({
      where: {
        course: { name: 'Ciencia y Tecnología' },
        section: { academicYearId: y2026.id, gradeLevel: 3, code: 'A' },
      },
    });
    cs3A = cs.id;
    section3A = cs.sectionId;
    period4 = (
      await prisma.academicPeriod.findFirstOrThrow({
        where: { academicYearId: y2026.id, sequence: 4 },
      })
    ).id;
    await cleanQa();

    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente03', 'estudiante01', 'estudiante05', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: `${key}@colegio.example` },
      });
      ids.set(key, user.id);
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  });

  afterAll(async () => {
    try {
      await cleanQa();
      if (original) {
        const current = await row();
        if (current.logoObjectKey && current.logoObjectKey !== original.logoObjectKey) {
          createdKeys.add(current.logoObjectKey);
        }
        await prisma.institutionSettings.update({
          where: { id: 1 },
          data: {
            name: original.name,
            literalScale: original.literalScale as object,
            purgeAfterDays: original.purgeAfterDays,
            logoObjectKey: original.logoObjectKey,
            logoMime: original.logoMime,
            updatedById: original.updatedById,
          },
        });
      }
      for (const key of createdKeys) {
        if (key === original?.logoObjectKey) continue;
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
      }
    } finally {
      s3?.destroy();
      await app?.close();
      await prisma?.$disconnect();
    }
  });

  beforeEach(() => {
    sink.records.length = 0;
  });

  describe('Permisos', () => {
    it('sin sesión 401; docente, estudiante y apoderado 403 en /admin/settings', async () => {
      await get(null, '/admin/settings').expect(401);
      await put(null, body()).expect(401);
      for (const who of ['docente03', 'estudiante01', 'apoderado01']) {
        await get(who, '/admin/settings').expect(403);
        await put(who, body()).expect(403);
        await putLogo(who, pngBytes()).expect(403);
      }
      expect((await row()).updatedAt).toEqual(original.updatedAt);
    });

    it('branding: cualquier rol con sesión; sin sesión 401', async () => {
      await get(null, '/institution/branding').expect(401);
      for (const who of ['admin', 'docente03', 'estudiante01', 'apoderado01']) {
        const res = await get(who, '/institution/branding').expect(200);
        expect(res.body.name).toBe(original.name);
        expect(Object.keys(res.body).sort()).toEqual(['logo', 'name']);
      }
    });
  });

  describe('Datos, tabla literal y plazo (RF-61)', () => {
    it('GET devuelve la fila id = 1 con la tabla ordenada de mayor a menor', async () => {
      const res = await get('admin', '/admin/settings').expect(200);
      expect(res.body).toMatchObject({
        name: original.name,
        purgeAfterDays: original.purgeAfterDays,
        literalScale: DEFAULT_SCALE,
      });
      expect(res.body).not.toHaveProperty('logoObjectKey');
      expect(res.body).not.toHaveProperty('updatedById');
    });

    it('PUT guarda, deja bitácora settings.update y el registro usa la nueva tabla', async () => {
      const before = await get('docente03', `/course-sections/${cs3A}/gradebook`).expect(200);
      expect(before.body.dashboard.riskLiteral).toBe('C');

      const res = await put(
        'admin',
        body({ name: '  I.E. Mater Christi QA  ', literalScale: CUSTOM_SCALE, purgeAfterDays: 90 }),
      ).expect(200);
      expect(res.body).toMatchObject({
        name: 'I.E. Mater Christi QA',
        purgeAfterDays: 90,
        literalScale: CUSTOM_SCALE,
      });
      const r = await row();
      expect(r).toMatchObject({ name: 'I.E. Mater Christi QA', purgeAfterDays: 90 });
      expect(await prisma.institutionSettings.count()).toBe(1);

      const [record] = auditOf('settings.update');
      expect(record).toMatchObject({
        module: 'settings',
        entityType: 'InstitutionSettings',
        entityId: '1',
        afterState: {
          changedFields: ['name', 'literalScale', 'purgeAfterDays'],
          purgeAfterDays: 90,
          literalScale: CUSTOM_SCALE,
        },
      });
      expect(JSON.stringify(record)).not.toContain('QA');

      const after = await get('docente03', `/course-sections/${cs3A}/gradebook`).expect(200);
      expect(after.body.dashboard.riskLiteral).toBe('X');
      expect(Object.keys(after.body.dashboard.distribution)).toContain('X');

      await put('admin', body()).expect(200);
      const back = await get('docente03', `/course-sections/${cs3A}/gradebook`).expect(200);
      expect(back.body.dashboard.riskLiteral).toBe('C');
    });

    it('RF-61/RF-47/RF-51: registro y "mis notas" usan la escala personalizada (literal X) y vuelven a la de siempre', async () => {
      const enrollment = await prisma.enrollment.findFirstOrThrow({
        where: { studentId: ids.get('estudiante05'), sectionId: section3A, isCurrent: true },
      });
      const assignment = await prisma.assignment.create({
        data: {
          courseSectionId: cs3A,
          periodId: period4,
          title: `${TITLE_PREFIX}Tarea`,
          instructions: 'Prueba de escala',
          dueAt: new Date(Date.now() + 30 * 86_400_000), // futura: no se materializan NE
          createdById: ids.get('docente03')!,
        },
      });
      await prisma.grade.create({
        data: {
          assignmentId: assignment.id,
          enrollmentId: enrollment.id,
          state: 'GRADED',
          value: '5',
          gradedAt: new Date(),
        },
      });

      type Row = { enrollmentId: string; average: { status: string; literal?: string } };
      const gradebookLiteral = async () => {
        const res = await get(
          'docente03',
          `/course-sections/${cs3A}/gradebook?periodId=${period4}`,
        ).expect(200);
        const mine = (res.body.students as Row[]).find((s) => s.enrollmentId === enrollment.id)!;
        return { literal: mine.average.literal, dashboard: res.body.dashboard };
      };
      const myGradesLiteral = async () => {
        const res = await get('estudiante05', '/me/grades').expect(200);
        const course = res.body.courses.find(
          (c: { courseSectionId: string; enrollmentId: string }) =>
            c.courseSectionId === cs3A && c.enrollmentId === enrollment.id,
        );
        const period = course.periods.find((p: { id: string }) => p.id === period4);
        return period.average as { status: string; literal?: string; rounded: number };
      };

      expect((await gradebookLiteral()).literal).toBe('C');
      expect(await myGradesLiteral()).toMatchObject({ status: 'OK', rounded: 5, literal: 'C' });

      try {
        await put('admin', body({ literalScale: CUSTOM_SCALE })).expect(200);
        const custom = await gradebookLiteral();
        expect(custom.literal).toBe('X');
        expect(custom.dashboard.riskLiteral).toBe('X');
        expect(custom.dashboard.atRisk).toContain(enrollment.id);
        expect(await myGradesLiteral()).toMatchObject({ rounded: 5, literal: 'X' });
      } finally {
        await put('admin', body()).expect(200);
      }
      expect((await gradebookLiteral()).literal).toBe('C');
      expect(await myGradesLiteral()).toMatchObject({ rounded: 5, literal: 'C' });
    });

    it('PUT sin cambios no deja bitácora', async () => {
      await put('admin', body()).expect(200);
      expect(auditOf('settings.update')).toHaveLength(0);
    });

    it('tabla inválida, plazo fuera de 1..3650, campos extra o faltantes → 400 sin cambiar la fila', async () => {
      const stamp = (await row()).updatedAt;
      const gap = await put('admin', body({ literalScale: [{ literal: 'A', min: 0, max: 19 }] }));
      expect(gap.status).toBe(400);
      expect(gap.body.error.code).toBe('VALIDATION_ERROR');
      expect(gap.body.error.details[0].path).toBe('literalScale');
      for (const bad of [
        body({ purgeAfterDays: 0 }),
        body({ purgeAfterDays: 3651 }),
        body({ logoObjectKey: 'institution/x.png' }),
        body({ literalScale: [{ literal: '<i>', min: 0, max: 20 }] }),
        { name: 'Solo nombre' },
      ]) {
        await put('admin', bad).expect(400);
      }
      expect((await row()).updatedAt).toEqual(stamp);
    });
  });

  describe('Logo (U5)', () => {
    let firstKey: string;

    it('PNG limpio (ClamAV real) → institution/<uuid>.png y branding con URL firmada', async () => {
      const scan = vi.spyOn(app.get(FileScanner), 'scan');
      const res = await putLogo('admin', pngBytes(240, 120)).expect(200);
      expect(scan).toHaveBeenCalledTimes(1);
      await expect(scan.mock.results[0].value).resolves.toEqual({ status: 'CLEAN' });
      scan.mockRestore();
      expect(res.body.logo).toMatchObject({ mime: 'image/png' });
      const r = await row();
      firstKey = r.logoObjectKey!;
      createdKeys.add(firstKey);
      expect(firstKey).toMatch(/^institution\/[0-9a-f-]{36}\.png$/);
      expect(r.logoMime).toBe('image/png');
      expect(await exists(firstKey)).toBe(true);
      expect(await prisma.storedFile.count({ where: { objectKey: firstKey } })).toBe(0);

      const [record] = auditOf('settings.logo.update');
      expect(record.afterState).toMatchObject({ mime: 'image/png', width: 240, height: 120 });
      expect(JSON.stringify(record)).not.toContain('logo.png');

      const brand = await get('estudiante01', '/institution/branding').expect(200);
      const url = new URL(brand.body.logo.url);
      expect(url.pathname).toContain(firstKey);
      const img = await fetch(brand.body.logo.url);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await img.arrayBuffer()).equals(pngBytes(240, 120))).toBe(true);
    });

    it('un JPEG reemplaza al PNG y borra el objeto anterior', async () => {
      const res = await putLogo('admin', jpegBytes(), 'logo.jpg', 'image/jpeg').expect(200);
      expect(res.body.logo.mime).toBe('image/jpeg');
      const r = await row();
      createdKeys.add(r.logoObjectKey!);
      expect(r.logoObjectKey).toMatch(/\.jpg$/);
      expect(await exists(firstKey)).toBe(false);
      expect(await exists(r.logoObjectKey!)).toBe(true);
    });

    it('rechazos: SVG 415, PNG dañado 415, > 512 KiB 413, sin archivo 400, campo extra 400', async () => {
      const keep = (await row()).logoObjectKey;
      const svg = await putLogo(
        'admin',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        'logo.svg',
        'image/svg+xml',
      );
      expect(svg.status).toBe(415);
      expect(svg.body.error.code).toBe('UNSUPPORTED_IMAGE');
      // Un SVG con nombre y tipo de PNG tampoco pasa: manda el contenido.
      await putLogo('admin', Buffer.from('<svg/>'), 'logo.png', 'image/png').expect(415);
      const broken = await putLogo('admin', pngBytes().subarray(0, 20));
      expect(broken.body.error.code).toBe('INVALID_IMAGE');
      await putLogo('admin', pngBytes(10, 10, 512 * 1024)).expect(413);
      await http()
        .put(`${API}/admin/settings/logo`)
        .set('Cookie', as('admin'))
        .send({})
        .expect(400);
      await http()
        .put(`${API}/admin/settings/logo`)
        .set('Cookie', as('admin'))
        .field('name', 'x')
        .attach('file', pngBytes(), 'logo.png')
        .expect(400);
      expect((await row()).logoObjectKey).toBe(keep);
      expect(auditOf('settings.logo.update')).toHaveLength(0);
    });

    it('EICAR suelto no llega al antivirus (no es imagen) → 415', async () => {
      const scan = vi.spyOn(app.get(FileScanner), 'scan');
      await putLogo('admin', Buffer.from(EICAR, 'latin1')).expect(415);
      expect(scan).not.toHaveBeenCalled();
      scan.mockRestore();
    });

    it('si el antivirus marca INFECTED → 422 FILE_INFECTED; nada en S3 ni en la fila', async () => {
      // clamd no reconoce EICAR detrás de una cabecera PNG binaria: se simula su veredicto.
      const keep = (await row()).logoObjectKey;
      const before = await prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
      const scan = vi
        .spyOn(app.get(FileScanner), 'scan')
        .mockResolvedValueOnce({ status: 'INFECTED', signature: 'Eicar-Test-Signature' });
      const res = await putLogo('admin', pngBytes());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('FILE_INFECTED');
      expect(scan).toHaveBeenCalledTimes(1);
      expect((await row()).logoObjectKey).toBe(keep);
      expect((await row()).updatedAt).toEqual(before.updatedAt);
      scan.mockRestore();
    });

    it('límite de 10 subidas por minuto por ADMIN → 429', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await putLogo('admin', Buffer.from('<svg/>'), 'x.svg', 'image/svg+xml')).status,
        );
      }
      expect(statuses).toContain(429);
      expect(statuses.filter((st) => st !== 429 && st !== 415)).toEqual([]);
    });
  });
});
