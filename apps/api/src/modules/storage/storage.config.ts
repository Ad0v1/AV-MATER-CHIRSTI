import { z } from 'zod';
import type { StorageConfig } from './storage.types.js';

/**
 * Variables S3_* definidas en .env.example (Dev 1).
 * Mismo estilo que apps/api/src/config/env.ts: valores por defecto solo para desarrollo
 * y fallo al arrancar si algo es inválido.
 */
const storageEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('aula-privado'),
  // En producción (R2) se usan credenciales propias. En local se reutilizan las de MinIO.
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  // Nombres que ya usan los respaldos (.env.example). Fase 3b de Dev 3 (29/10/2026).
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MINIO_ROOT_USER: z.string().optional(),
  MINIO_ROOT_PASSWORD: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  S3_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  // 60 s: decisión del usuario del 29/10/2026 (expediente Dev 3, decisión 4).
  S3_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
});

// Valores de desarrollo; coinciden con .env.example.
const DEV_ENDPOINT = 'http://localhost:9000';
const DEV_ACCESS_KEY = 'minio_dev';
const DEV_SECRET_KEY = 'minio_dev_change_me';

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadStorageConfig(source: NodeJS.ProcessEnv = process.env): StorageConfig {
  const result = storageEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion de almacenamiento invalida: ${problems.join('; ')}`);
  }
  const env = result.data;
  const isProduction = env.NODE_ENV === 'production';

  const accessKeyId =
    nonEmpty(env.S3_ACCESS_KEY) ??
    nonEmpty(env.S3_ACCESS_KEY_ID) ??
    nonEmpty(env.MINIO_ROOT_USER) ??
    (isProduction ? undefined : DEV_ACCESS_KEY);
  const secretAccessKey =
    nonEmpty(env.S3_SECRET_KEY) ??
    nonEmpty(env.S3_SECRET_ACCESS_KEY) ??
    nonEmpty(env.MINIO_ROOT_PASSWORD) ??
    (isProduction ? undefined : DEV_SECRET_KEY);

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'Configuracion de almacenamiento invalida: faltan S3_ACCESS_KEY y S3_SECRET_KEY en produccion',
    );
  }

  return {
    endpoint: nonEmpty(env.S3_ENDPOINT) ?? (isProduction ? undefined : DEV_ENDPOINT),
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    uploadUrlTtlSeconds: env.S3_UPLOAD_URL_TTL_SECONDS,
    downloadUrlTtlSeconds: env.S3_DOWNLOAD_URL_TTL_SECONDS,
  };
}
