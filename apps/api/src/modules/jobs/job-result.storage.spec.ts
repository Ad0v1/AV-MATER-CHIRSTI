import { describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageService, type StorageConfig } from '../storage/index.js';
import {
  buildResultKey,
  isResultKey,
  JobResultStorage,
  safeResultFileName,
} from './job-result.storage.js';

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

describe('claves y nombres de resultados', () => {
  it('genera exports/{año}/{mes}/{uuid}.{ext} y solo acepta ese formato', () => {
    const key = buildResultKey('xlsx', new Date('2026-03-05T00:00:00Z'), ID.toUpperCase());
    expect(key).toBe(`exports/2026/03/${ID}.xlsx`);
    expect(isResultKey(key)).toBe(true);
    expect(isResultKey(`submissions/2026/03/${ID}.pdf`)).toBe(false);
    expect(isResultKey(`exports/2026/03/../${ID}.zip`)).toBe(false);
    expect(isResultKey(`exports/2026/03/${ID}.exe`)).toBe(false);
  });

  it('limpia el nombre de descarga y fuerza la extension', () => {
    expect(safeResultFileName('Notas 1°A "final"/x', 'xlsx')).toBe('Notas 1_A _final__x.xlsx');
    expect(safeResultFileName('..', 'zip')).toBe('resultado.zip');
    expect(safeResultFileName('reporte.pdf', 'pdf')).toBe('reporte.pdf');
  });
});

describe('JobResultStorage', () => {
  it('firma una URL GET de 60 s con el tipo y el nombre del resultado (sin red)', async () => {
    const s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    const storage = new JobResultStorage(new StorageService(s3, config));
    const signed = await storage.createDownloadUrl(`exports/2026/10/${ID}.xlsx`, 'Notas 1A');
    const url = new URL(signed.url);
    expect(url.pathname).toBe(`/aula-privado/exports/2026/10/${ID}.xlsx`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('response-content-type')).toContain('spreadsheetml');
    expect(url.searchParams.get('response-content-disposition')).toContain('Notas 1A.xlsx');
    s3.destroy();
  });

  it('rechaza claves que no son de resultados', async () => {
    const send = vi.fn();
    const storage = new JobResultStorage(
      new StorageService({ send } as unknown as S3Client, config),
    );
    await expect(storage.delete(`submissions/2026/10/${ID}.pdf`)).rejects.toThrow(/invalida/);
    await expect(storage.createDownloadUrl('../x', 'a')).rejects.toThrow(/invalida/);
    expect(send).not.toHaveBeenCalled();
  });

  it('borra con DeleteObject en el bucket privado', async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const storage = new JobResultStorage(
      new StorageService({ send } as unknown as S3Client, config),
    );
    await storage.delete(`exports/2026/10/${ID}.zip`);
    const cmd = (send.mock.calls[0] as unknown[])[0] as { input: Record<string, string> };
    expect(cmd.input).toEqual({ Bucket: 'aula-privado', Key: `exports/2026/10/${ID}.zip` });
  });
});
