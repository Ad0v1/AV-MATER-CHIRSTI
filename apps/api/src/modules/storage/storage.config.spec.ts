import { describe, expect, it } from 'vitest';
import { loadStorageConfig } from './storage.config.js';

describe('loadStorageConfig', () => {
  it('en desarrollo usa los valores de .env.example por defecto', () => {
    const config = loadStorageConfig({});
    expect(config.endpoint).toBe('http://localhost:9000');
    expect(config.bucket).toBe('aula-privado');
    expect(config.region).toBe('us-east-1');
    expect(config.accessKeyId).toBe('minio_dev');
    expect(config.forcePathStyle).toBe(true);
    expect(config.uploadUrlTtlSeconds).toBe(300);
    expect(config.downloadUrlTtlSeconds).toBe(120);
  });

  it('reutiliza las credenciales de MinIO si no hay S3_ACCESS_KEY', () => {
    const config = loadStorageConfig({ MINIO_ROOT_USER: 'usuario', MINIO_ROOT_PASSWORD: 'clave' });
    expect(config.accessKeyId).toBe('usuario');
    expect(config.secretAccessKey).toBe('clave');
  });

  it('prefiere S3_ACCESS_KEY y S3_SECRET_KEY cuando existen', () => {
    const config = loadStorageConfig({
      S3_ACCESS_KEY: 'r2-key',
      S3_SECRET_KEY: 'r2-secret',
      MINIO_ROOT_USER: 'usuario',
      MINIO_ROOT_PASSWORD: 'clave',
    });
    expect(config.accessKeyId).toBe('r2-key');
    expect(config.secretAccessKey).toBe('r2-secret');
  });

  it('en producción exige credenciales explícitas', () => {
    expect(() => loadStorageConfig({ NODE_ENV: 'production' })).toThrow(/S3_ACCESS_KEY/);
  });

  it('rechaza duraciones de URL fuera de rango', () => {
    expect(() => loadStorageConfig({ S3_UPLOAD_URL_TTL_SECONDS: '5' })).toThrow(
      /S3_UPLOAD_URL_TTL_SECONDS/,
    );
  });
});
