import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { assertAssetKey, assetFormatOf, isAssetKey } from './asset-key.util.js';
import { isValidObjectKey } from './object-key.util.js';
import { StorageService } from './storage.service.js';
import type { StorageConfig } from './storage.types.js';

// B4 (QA): lista blanca de StorageService, casos limite. Complementa storage.assets.spec.ts.

type SendMock = MockInstance<(command: unknown) => Promise<unknown>>;
const config: StorageConfig = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'aula-privado',
  accessKeyId: 'k',
  secretAccessKey: 's',
  forcePathStyle: true,
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
};
const ID = '3f2c1a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f';

function createService(): { service: StorageService; send: SendMock } {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: 'k', secretAccessKey: 's' },
  });
  const send = vi.spyOn(s3, 'send') as unknown as SendMock;
  return { service: new StorageService(s3, config), send };
}

const body = (bytes: Buffer) => ({
  ContentLength: bytes.length,
  Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(bytes)) },
});

describe('asset keys: prefijo × extensión (B4)', () => {
  const VALID: Record<string, string[]> = {
    exports: ['xlsx', 'pdf', 'zip', 'json'],
    backups: ['xlsx', 'pdf', 'zip', 'json'],
    institution: ['png', 'jpg'],
  };
  const ALL_EXT = ['xlsx', 'pdf', 'zip', 'json', 'png', 'jpg', 'jpeg', 'svg', 'exe', 'html', 'gif'];
  const keyOf = (prefix: string, ext: string) =>
    prefix === 'institution' ? `institution/${ID}.${ext}` : `${prefix}/2026/10/${ID}.${ext}`;

  for (const [prefix, valid] of Object.entries(VALID)) {
    for (const ext of ALL_EXT) {
      const ok = valid.includes(ext);
      it(`${prefix}/ .${ext} → ${ok ? 'válida' : 'inválida'}`, () => {
        expect(isAssetKey(keyOf(prefix, ext))).toBe(ok);
        if (ok) expect(() => assertAssetKey(keyOf(prefix, ext))).not.toThrow();
        else expect(() => assertAssetKey(keyOf(prefix, ext))).toThrow(BadRequestException);
      });
    }
  }

  it('assetFormatOf devuelve la extensión de una clave válida', () => {
    expect(assetFormatOf(`exports/2026/10/${ID}.xlsx`)).toBe('xlsx');
    expect(assetFormatOf(`institution/${ID}.jpg`)).toBe('jpg');
  });

  it.each([
    ['extensión en mayúsculas', `institution/${ID}.PNG`],
    ['uuid en mayúsculas', `institution/${ID.toUpperCase()}.png`],
    ['doble extensión', `institution/${ID}.png.exe`],
    ['sin extensión', `institution/${ID}`],
    ['mes 00', `exports/2026/00/${ID}.zip`],
    ['año de 2 dígitos', `exports/26/10/${ID}.zip`],
    ['prefijo desconocido', `logs/2026/10/${ID}.zip`],
    ['prefijo sin barra', 'institution'],
    ['clave vacía', ''],
    ['salto de línea al final', `institution/${ID}.png\n`],
    ['nombre arbitrario', 'institution/logo.png'],
  ])('rechaza: %s', (_label, key) => expect(isAssetKey(key)).toBe(false));

  it.each([
    `institution/../${ID}.png`,
    `institution/..%2F${ID}.png`,
    `institution/${ID}/../${ID}.png`,
    `exports/2026/10/../../../etc/${ID}.zip`,
    `exports/2026/10/..\\${ID}.zip`,
    `/institution/${ID}.png`,
    `exports//2026/10/${ID}.zip`,
    `backups/2026/10/${ID}.zip/../x.zip`,
    `institution/${ID}.png\0.exe`,
    `incoming/../exports/2026/10/${ID}.zip`,
  ])('path traversal rechazado: %j', (key) => {
    expect(isAssetKey(key)).toBe(false);
    expect(() => assertAssetKey(key)).toThrow(BadRequestException);
  });

  it('las claves de activos no son claves PDF y viceversa (listas disjuntas)', () => {
    for (const k of [
      `exports/2026/10/${ID}.pdf`,
      `backups/2026/10/${ID}.pdf`,
      `institution/${ID}.png`,
    ]) {
      expect(isAssetKey(k)).toBe(true);
      expect(isValidObjectKey(k)).toBe(false);
    }
    const pdfKey = `submissions/2026/10/${ID}.pdf`;
    expect(isAssetKey(pdfKey)).toBe(false);
  });
});

describe('StorageService: las operaciones de activos validan la clave antes de tocar S3 (B4)', () => {
  it('putAsset, createAssetDownloadUrl, headAsset, readAsset y deleteAsset rechazan claves ajenas', async () => {
    const { service, send } = createService();
    const bad = [
      `institution/../${ID}.png`,
      `submissions/2026/10/${ID}.pdf`,
      `incoming/2026/10/${ID}.pdf`,
      `exports/2026/10/${ID}.exe`,
    ];
    for (const key of bad) {
      await expect(service.putAsset(key, Buffer.alloc(1))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.createAssetDownloadUrl(key)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.headAsset(key)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.readAsset(key, 10)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.deleteAsset(key)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('las claves PDF siguen rechazando exports/ y backups/ en todas las operaciones PDF', async () => {
    const { service, send } = createService();
    for (const key of [`exports/2026/10/${ID}.pdf`, `backups/2026/10/${ID}.pdf`]) {
      await expect(service.createDownloadUrl(key)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.headObject(key)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.deleteObject(key)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('createAssetDownloadUrl: solo tipos de la lista blanca; el predeterminado sale de la extensión', async () => {
    const { service } = createService();
    for (const bad of ['text/html', 'image/svg+xml', 'application/x-msdownload', '']) {
      await expect(
        service.createAssetDownloadUrl(`institution/${ID}.png`, { contentType: bad }),
      ).rejects.toThrow();
    }
    const signed = await service.createAssetDownloadUrl(`institution/${ID}.jpg`, { inline: true });
    const url = new URL(signed.url);
    expect(url.searchParams.get('response-content-type')).toBe('image/jpeg');
    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
  });
});

describe('StorageService.readAsset(maxBytes) en el límite (B4)', () => {
  const KEY = `institution/${ID}.png`;

  it('exactamente maxBytes → se lee', async () => {
    const { service, send } = createService();
    const bytes = Buffer.alloc(5, 7);
    send.mockResolvedValue(body(bytes));
    await expect(service.readAsset(KEY, 5)).resolves.toEqual(bytes);
  });

  it('maxBytes + 1 declarado (ContentLength) → 413 sin leer el cuerpo', async () => {
    const { service, send } = createService();
    const transform = vi.fn();
    send.mockResolvedValue({ ContentLength: 6, Body: { transformToByteArray: transform } });
    await expect(service.readAsset(KEY, 5)).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(transform).not.toHaveBeenCalled();
  });

  it('ContentLength miente (dice 5 y llegan 6) → 413 tras leer', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({
      ContentLength: 5,
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(6)) },
    });
    await expect(service.readAsset(KEY, 5)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('objeto vacío con maxBytes 0 → se lee vacío; sin cuerpo → 503', async () => {
    const { service, send } = createService();
    send.mockResolvedValueOnce(body(Buffer.alloc(0)));
    await expect(service.readAsset(KEY, 0)).resolves.toHaveLength(0);
    send.mockResolvedValueOnce({ ContentLength: 0, Body: undefined });
    await expect(service.readAsset(KEY, 10)).rejects.toMatchObject({ status: 503 });
  });
});
