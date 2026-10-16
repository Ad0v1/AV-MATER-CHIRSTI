import { StorageConfig } from './storage.types';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno ${name} (módulo storage).`);
  }
  return value.trim();
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo (recibido: "${value}").`);
  }
  return parsed;
}

/**
 * Lee la configuración desde variables de entorno.
 * Cuando Dev 1 defina el sistema de configuración común, esta función se adapta a él.
 */
export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  return {
    endpoint: env.STORAGE_ENDPOINT?.trim() || undefined,
    region: env.STORAGE_REGION?.trim() || 'us-east-1',
    bucket: required(env, 'STORAGE_BUCKET'),
    accessKeyId: required(env, 'STORAGE_ACCESS_KEY'),
    secretAccessKey: required(env, 'STORAGE_SECRET_KEY'),
    forcePathStyle: (env.STORAGE_FORCE_PATH_STYLE ?? 'true').trim() === 'true',
    uploadUrlTtlSeconds: positiveInt(env.STORAGE_UPLOAD_URL_TTL, 300, 'STORAGE_UPLOAD_URL_TTL'),
    downloadUrlTtlSeconds: positiveInt(env.STORAGE_DOWNLOAD_URL_TTL, 120, 'STORAGE_DOWNLOAD_URL_TTL'),
  };
}
