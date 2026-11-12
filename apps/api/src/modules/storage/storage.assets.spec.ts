import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { isAssetKey } from './asset-key.util.js';
import { StorageService } from './storage.service.js';
import type { StorageConfig } from './storage.types.js';

// B4: lista blanca por prefijo para objetos que no son PDF de contenidos.

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

describe('isAssetKey (B4)', () => {
  it.each([
    `exports/2026/10/${ID}.xlsx`,
    `exports/2026/10/${ID}.zip`,
    `backups/2026/10/${ID}.json`,
    `institution/${ID}.png`,
    `institution/${ID}.jpg`,
  ])('acepta %s', (key) => expect(isAssetKey(key)).toBe(true));

  it.each([
    `submissions/2026/10/${ID}.pdf`,
    `institution/${ID}.svg`,
    `institution/2026/10/${ID}.png`,
    `exports/2026/10/${ID}.png`,
    `exports/2026/13/${ID}.zip`,
    `exports/2026/10/../${ID}.zip`,
    `exports/2026/10/${ID}.exe`,
    `other/${ID}.png`,
  ])('rechaza %s', (key) => expect(isAssetKey(key)).toBe(false));
});

describe('StorageService: objetos de la lista blanca (B4)', () => {
  it('putAsset sube con el tipo de la extensión', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({});
    await expect(service.putAsset(`institution/${ID}.jpg`, Buffer.from([1, 2]))).resolves.toBe(2);
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd.input).toMatchObject({ Key: `institution/${ID}.jpg`, ContentType: 'image/jpeg' });
  });

  it('rechaza claves fuera de la lista blanca sin tocar S3', async () => {
    const { service, send } = createService();
    await expect(
      service.putAsset(`submissions/2026/10/${ID}.pdf`, Buffer.alloc(1)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.deleteAsset(`institution/${ID}.svg`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('las validaciones PDF siguen intactas para claves de exports/', async () => {
    const { service } = createService();
    await expect(service.createDownloadUrl(`exports/2026/10/${ID}.xlsx`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('firma una URL GET con el tipo y la vigencia pedidos', async () => {
    const { service } = createService();
    const signed = await service.createAssetDownloadUrl(`exports/2026/10/${ID}.xlsx`, {
      fileName: 'Notas.xlsx',
    });
    const url = new URL(signed.url);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('response-content-type')).toContain('spreadsheetml');
    await expect(
      service.createAssetDownloadUrl(`institution/${ID}.png`, { contentType: 'text/html' }),
    ).rejects.toThrow();
  });

  it('headAsset devuelve null si el objeto no existe', async () => {
    const { service, send } = createService();
    send.mockRejectedValue(Object.assign(new Error('nf'), { name: 'NotFound' }));
    await expect(service.headAsset(`backups/2026/10/${ID}.zip`)).resolves.toBeNull();
  });

  it('readAsset rechaza objetos más grandes que el máximo', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({ ContentLength: 10, Body: undefined });
    await expect(service.readAsset(`institution/${ID}.png`, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('B1: sin ContentLength cuenta el stream y corta con 413', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({ Body: Readable.from([Buffer.alloc(4), Buffer.alloc(4)]) });
    await expect(service.readAsset(`institution/${ID}.png`, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('B1: ContentLength que miente no evita el corte', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({ ContentLength: 1, Body: Readable.from([Buffer.alloc(10)]) });
    await expect(service.readAsset(`institution/${ID}.png`, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('B1: dentro del máximo devuelve los bytes', async () => {
    const { service, send } = createService();
    send.mockResolvedValue({ Body: Readable.from([Buffer.from([1, 2]), Buffer.from([3])]) });
    await expect(service.readAsset(`institution/${ID}.png`, 5)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it('B2: prefijos heredados de Object.prototype dan false o 400, nunca 500', async () => {
    for (const key of ['constructor/x', '__proto__/x', 'toString/x', 'hasOwnProperty/a.png']) {
      expect(isAssetKey(key)).toBe(false);
    }
    const { service, send } = createService();
    await expect(service.deleteAsset('constructor/x')).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('B3: el contentType debe coincidir con el formato de la clave', async () => {
    const { service } = createService();
    await expect(
      service.createAssetDownloadUrl(`institution/${ID}.png`, { contentType: 'image/jpeg' }),
    ).rejects.toThrow();
    await expect(
      service.createAssetDownloadUrl(`exports/2026/10/${ID}.xlsx`, {
        contentType: 'application/zip',
      }),
    ).rejects.toThrow();
    await expect(
      service.createAssetDownloadUrl(`institution/${ID}.jpg`, { contentType: 'image/jpeg' }),
    ).resolves.toMatchObject({ method: 'GET' });
  });
});
