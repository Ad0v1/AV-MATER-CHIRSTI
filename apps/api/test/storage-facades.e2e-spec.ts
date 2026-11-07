import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import { config } from 'dotenv';
import { App } from 'supertest/types.js';
import {
  buildResultKey,
  JobResultStorage,
  type ResultFormat,
} from './../src/modules/jobs/index.js';
import {
  buildLogoKey,
  InstitutionLogoStorage,
} from './../src/modules/settings/institution-logo.storage.js';
import { LOGO_MAX_BYTES } from './../src/modules/settings/logo-image.js';
import { pngBytes } from './../src/modules/settings/logo-fixtures.mock-spec.js';
import { StorageService } from './../src/modules/storage/index.js';
import { createDbTestApp } from './helpers.js';

// B4 (QA): regresion de las fachadas JobResultStorage e InstitutionLogoStorage, ahora sobre
// StorageService.*Asset, contra MinIO real (solo local con Docker). Verifica subida (Buffer y
// stream), URL firmada realmente descargable con el tipo y el nombre correctos, tamano, lectura
// con tope, borrado idempotente y que las claves de otros prefijos no se tocan.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

describe.skipIf(!process.env.DATABASE_URL)(
  'Fachadas de almacenamiento (e2e, MinIO real, B4)',
  () => {
    let app: INestApplication<App>;
    let results: JobResultStorage;
    let logos: InstitutionLogoStorage;
    let storage: StorageService;
    const keys = new Set<string>();

    const fetchSigned = async (url: string) => {
      const res = await fetch(url);
      return { res, bytes: Buffer.from(await res.arrayBuffer()) };
    };

    beforeAll(async () => {
      app = await createDbTestApp();
      results = app.get(JobResultStorage, { strict: false });
      logos = app.get(InstitutionLogoStorage, { strict: false });
      storage = app.get(StorageService, { strict: false });
    });

    afterAll(async () => {
      for (const k of keys) {
        await storage.deleteAsset(k).catch(() => undefined);
      }
      await app?.close();
    });

    describe('JobResultStorage', () => {
      it.each<[ResultFormat, 'exports' | 'backups', string]>([
        ['xlsx', 'exports', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['zip', 'backups', 'application/zip'],
        ['json', 'backups', 'application/json'],
        ['pdf', 'exports', 'application/pdf'],
      ])('%s en %s/: sube, mide, firma, descarga y borra', async (format, prefix, mime) => {
        const key = buildResultKey(format, new Date(), randomUUID(), prefix);
        keys.add(key);
        const payload = Buffer.from(`contenido-${format}-${randomUUID()}`);
        await expect(results.upload(key, payload)).resolves.toBe(payload.length);
        await expect(results.size(key)).resolves.toBe(payload.length);

        const signed = await results.createDownloadUrl(key, 'Notas 5to Ñandú');
        expect(signed.method).toBe('GET');
        const { res, bytes } = await fetchSigned(signed.url);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe(mime);
        expect(res.headers.get('content-disposition')).toContain('attachment');
        expect(res.headers.get('content-disposition')).toContain(`.${format}`);
        expect(bytes.equals(payload)).toBe(true);

        await results.delete(key);
        await expect(results.size(key)).resolves.toBeNull();
        await expect(results.delete(key)).resolves.toBeUndefined(); // idempotente
        const gone = await fetchSigned(signed.url);
        expect(gone.res.status).toBe(404);
      });

      it('sube desde un stream (multipart) y devuelve el tamaño real', async () => {
        const key = buildResultKey('zip');
        keys.add(key);
        const chunks = [Buffer.alloc(1024, 1), Buffer.alloc(2048, 2)];
        const size = await results.upload(key, Readable.from(chunks));
        expect(size).toBe(3072);
        await expect(results.size(key)).resolves.toBe(3072);
      });

      it('rechaza claves fuera de exports/ y backups/ sin tocar el bucket', async () => {
        await expect(
          results.upload(`institution/${randomUUID()}.png`, Buffer.alloc(1)),
        ).rejects.toThrow();
        await expect(results.size(`exports/2026/13/${randomUUID()}.zip`)).rejects.toThrow();
        await expect(results.delete(`exports/2026/10/../${randomUUID()}.zip`)).rejects.toThrow();
      });
    });

    describe('InstitutionLogoStorage', () => {
      it('sube el logo, firma una URL inline con el mime de la BD y se lee de vuelta', async () => {
        const key = buildLogoKey('png');
        keys.add(key);
        const png = pngBytes();
        await logos.upload(key, png);

        const { url, expiresAt } = await logos.signedUrl(key, 'image/png');
        expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
        const { res, bytes } = await fetchSigned(url);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect(res.headers.get('content-disposition')).toBe('inline');
        expect(res.headers.get('cache-control')).toBe('private, max-age=600');
        expect(bytes.equals(png)).toBe(true);

        await expect(logos.download(key)).resolves.toEqual(png);
      });

      it('signedUrl rechaza un mime que no es de la lista blanca (p. ej. text/html)', async () => {
        const key = buildLogoKey('png');
        await expect(logos.signedUrl(key, 'text/html')).rejects.toThrow();
      });

      it('download de un objeto inexistente o mayor que LOGO_MAX_BYTES falla como "Logo invalido"', async () => {
        await expect(logos.download(buildLogoKey('png'))).rejects.toThrow('Logo invalido');

        const big = buildLogoKey('jpg');
        keys.add(big);
        await storage.putAsset(big, Buffer.alloc(LOGO_MAX_BYTES + 1, 1));
        await expect(logos.download(big)).rejects.toThrow('Logo invalido');
      });

      it('un objeto exactamente de LOGO_MAX_BYTES se lee', async () => {
        const key = buildLogoKey('png');
        keys.add(key);
        await storage.putAsset(key, Buffer.alloc(LOGO_MAX_BYTES, 3));
        await expect(logos.download(key)).resolves.toHaveLength(LOGO_MAX_BYTES);
      });

      it('delete es idempotente y las claves ajenas se rechazan', async () => {
        const key = buildLogoKey('png');
        await expect(logos.delete(key)).resolves.toBeUndefined();
        await expect(logos.delete(`exports/2026/10/${randomUUID()}.zip`)).rejects.toThrow();
        await expect(logos.upload('institution/logo.png', Buffer.alloc(1))).rejects.toThrow();
      });
    });
  },
);
