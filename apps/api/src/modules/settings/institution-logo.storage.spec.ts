import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { StorageService, type StorageConfig } from '../storage/index.js';
import {
  buildLogoKey,
  InstitutionLogoStorage,
  isLogoKey,
  LOGO_URL_TTL_SECONDS,
} from './institution-logo.storage.js';

const config: StorageConfig = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  bucket: 'aula-privado',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  forcePathStyle: true,
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
};
const ID = '0192f0c4-0000-7000-8000-000000000001';

describe('claves del logo (U5)', () => {
  it('institution/{uuid}.{png|jpg} y nada más', () => {
    expect(buildLogoKey('png', ID.toUpperCase())).toBe(`institution/${ID}.png`);
    expect(isLogoKey(`institution/${ID}.jpg`)).toBe(true);
    for (const key of [
      `institution/${ID}.svg`,
      `institution/../${ID}.png`,
      `exports/2026/10/${ID}.png`,
      `institution/logo.png`,
    ]) {
      expect(isLogoKey(key)).toBe(false);
    }
  });
});

describe('InstitutionLogoStorage', () => {
  it('firma una URL GET de 10 min con el tipo de la BD, inline (sin red)', async () => {
    const s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const storage = new InstitutionLogoStorage(new StorageService(s3, config));
    const signed = await storage.signedUrl(`institution/${ID}.png`, 'image/png');
    const url = new URL(signed.url);
    expect(url.pathname).toBe(`/aula-privado/institution/${ID}.png`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(LOGO_URL_TTL_SECONDS));
    expect(url.searchParams.get('response-content-type')).toBe('image/png');
    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
    s3.destroy();
  });

  it('sube con el tipo de la extensión y rechaza claves ajenas', async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const storage = new InstitutionLogoStorage(
      new StorageService({ send } as unknown as S3Client, config),
    );
    await storage.upload(`institution/${ID}.jpg`, Buffer.from([1, 2, 3]));
    const input = (send.mock.calls[0] as unknown as [{ input: Record<string, unknown> }])[0].input;
    expect(input).toMatchObject({
      Bucket: 'aula-privado',
      Key: `institution/${ID}.jpg`,
      ContentType: 'image/jpeg',
      ContentLength: 3,
    });
    await expect(storage.upload(`exports/2026/10/${ID}.zip`, Buffer.alloc(1))).rejects.toThrow();
    await expect(storage.delete(`submissions/x.pdf`)).rejects.toThrow();
    await expect(storage.signedUrl('institution/x.svg', 'image/svg+xml')).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
