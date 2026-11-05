import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditSink } from './../src/common/audit/audit.service.js';
import { SESSION_COOKIE } from './../src/common/session/session-cookie.js';
import { SessionService } from './../src/common/session/session.service.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  jpegBytes,
  PNG_BASE_BYTES,
  pngBytes,
} from './../src/modules/settings/logo-fixtures.mock-spec.js';
import { LOGO_MAX_BYTES } from './../src/modules/settings/logo-image.js';
import { loadStorageConfig } from './../src/modules/storage/storage.config.js';
import { createDbTestApp, MemoryAuditSink } from './helpers.js';

// QA de la fase 5c (RF-61, U5): casos límite del logo. Archivo aparte para tener su propio límite
// de 10 subidas por minuto (el de settings.e2e-spec.ts ya se gasta con sus rechazos). Usa 9 PUT
// del ADMIN como máximo. MySQL, MinIO y ClamAV reales (solo local). Deja la fila id = 1 como estaba.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const API = '/api/v1';
type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'GUARDIAN';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!process.env.DATABASE_URL)('Logo institucional, casos límite (e2e, 5c)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let s3: S3Client;
  let bucket: string;
  let sink: MemoryAuditSink;
  let original: Awaited<ReturnType<PrismaClient['institutionSettings']['findUniqueOrThrow']>>;
  const cookies = new Map<string, string>();
  const createdKeys = new Set<string>();

  const as = (key: string) => `${SESSION_COOKIE}=${cookies.get(key)}`;
  const row = () => prisma.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
  const putLogo = (key: string, content: Buffer, name = 'logo.png', type = 'image/png') =>
    request(app.getHttpServer())
      .put(`${API}/admin/settings/logo`)
      .set('Cookie', as(key))
      .attach('file', content, { filename: name, contentType: type });
  const branding = (key: string) =>
    request(app.getHttpServer()).get(`${API}/institution/branding`).set('Cookie', as(key));
  const remember = async () => {
    const k = (await row()).logoObjectKey;
    if (k) createdKeys.add(k);
    return k;
  };
  /** Rechazo: ni la fila ni la bitácora cambian. */
  const expectUntouched = async (keyBefore: string | null) => {
    expect((await row()).logoObjectKey).toBe(keyBefore);
    expect(sink.records.filter((r) => r.action === 'settings.logo.update')).toHaveLength(0);
  };

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
    await boot();
  });

  /** App nueva = contador de límite de peticiones nuevo (10 subidas por minuto por ADMIN). */
  async function boot() {
    app = await createDbTestApp();
    sink = app.get(AuditSink) as MemoryAuditSink;
    const sessions = app.get(SessionService);
    for (const key of ['admin', 'docente03', 'estudiante01', 'apoderado01']) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: `${key}@colegio.example` },
      });
      cookies.set(key, await sessions.create({ id: user.id, role: user.role as Role }));
    }
  }

  afterAll(async () => {
    try {
      if (original) {
        await remember();
        await prisma.institutionSettings.update({
          where: { id: 1 },
          data: {
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

  it('RF-61: archivo de 0 bytes → 400 EMPTY_FILE y nada cambia', async () => {
    const keep = (await row()).logoObjectKey;
    const res = await putLogo('admin', Buffer.alloc(0));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPTY_FILE');
    await expectUntouched(keep);
  });

  it('RF-61: 512 KiB justos se aceptan; 512 KiB + 1 byte → 413 PAYLOAD_TOO_LARGE', async () => {
    const keep = await remember();
    const over = await putLogo('admin', pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES + 1));
    expect(over.status).toBe(413);
    await expectUntouched(keep);

    const exact = pngBytes(10, 10, LOGO_MAX_BYTES - PNG_BASE_BYTES);
    expect(exact.length).toBe(LOGO_MAX_BYTES);
    const ok = await putLogo('admin', exact).expect(200);
    expect(ok.body.logo.mime).toBe('image/png');
    await remember();
    const [record] = sink.records.filter((r) => r.action === 'settings.logo.update');
    expect(record.afterState).toMatchObject({ sizeBytes: LOGO_MAX_BYTES });
  });

  it('U5: la URL de branding sirve el logo a los cuatro roles, con vigencia de 10 min', async () => {
    const current = (await row()).logoObjectKey!;
    for (const who of ['admin', 'docente03', 'estudiante01', 'apoderado01']) {
      const res = await branding(who).expect(200);
      const logo = res.body.logo as Json;
      expect(Object.keys(res.body).sort()).toEqual(['logo', 'name']);
      expect(logo.mime).toBe('image/png');
      expect(new URL(logo.url).pathname).toContain(current);
      const left = new Date(logo.expiresAt).getTime() - Date.now();
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(10 * 60_000 + 5_000);
      const img = await fetch(logo.url);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
    }
  });

  it('U5: roles distintos de ADMIN no pueden subir el logo (403) aunque el archivo sea válido', async () => {
    const keep = (await row()).logoObjectKey;
    for (const who of ['docente03', 'estudiante01', 'apoderado01']) {
      await putLogo(who, pngBytes()).expect(403);
    }
    await expectUntouched(keep);
  });

  it('U5: un GIF o un SVG con nombre y tipo de imagen válidos → 415 UNSUPPORTED_IMAGE', async () => {
    const keep = (await row()).logoObjectKey;
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40)]);
    const asPng = await putLogo('admin', gif, 'logo.png', 'image/png');
    expect(asPng.status).toBe(415);
    expect(asPng.body.error.code).toBe('UNSUPPORTED_IMAGE');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const asJpg = await putLogo('admin', svg, 'logo.jpg', 'image/jpeg');
    expect(asJpg.status).toBe(415);
    expect(asJpg.body.error.code).toBe('UNSUPPORTED_IMAGE');
    await expectUntouched(keep);
  });

  describe('con el contador de subidas en cero', () => {
    beforeAll(async () => {
      await app.close();
      await boot();
    });

    it('U5: PNG con IHDR inválido o JPEG sin dimensiones → 415 INVALID_IMAGE', async () => {
      const keep = (await row()).logoObjectKey;
      const noIhdr = pngBytes();
      noIhdr.write('IDAT', 12, 'latin1');
      const badLength = pngBytes();
      badLength.writeUInt32BE(12, 8);
      for (const bad of [noIhdr, badLength, pngBytes(0, 0)]) {
        const res = await putLogo('admin', bad);
        expect(res.status).toBe(415);
        expect(res.body.error.code).toBe('INVALID_IMAGE');
      }
      const jpg = await putLogo(
        'admin',
        Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0]),
        'l.jpg',
      );
      expect(jpg.body.error.code).toBe('INVALID_IMAGE');
      await expectUntouched(keep);
    });

    it('U5: más de 4096 px de lado → 415; 4096 justos se aceptan', async () => {
      const keep = (await row()).logoObjectKey;
      for (const [w, h] of [
        [4097, 10],
        [10, 4097],
      ]) {
        const res = await putLogo('admin', pngBytes(w, h));
        expect(res.status).toBe(415);
        expect(res.body.error.code).toBe('INVALID_IMAGE');
      }
      const jpeg = await putLogo('admin', jpegBytes(5000, 10), 'l.jpg', 'image/jpeg');
      expect(jpeg.status).toBe(415);
      await expectUntouched(keep);

      await putLogo('admin', pngBytes(4096, 4096)).expect(200);
      await remember();
    });
  });
});
