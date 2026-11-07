import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ASSET_CONTENT_TYPES, StorageService, type SignedUrl } from '../storage/index.js';

// Resultados de los trabajos (XLSX, PDF, ZIP, JSON) en el bucket privado. Desde B4 (07/11/2026) es
// una fachada fina sobre StorageService (lista blanca exports/ y backups/), con la misma vigencia
// de URL (60 s). Prefijos:
//   - exports/: exportaciones que vencen a los EXPORT_TTL_DAYS (U6); admite regla de bucket.
//   - backups/: respaldos anuales (RF-65) que se conservan hasta la purga del año (U6, U7).
//     Fuera de exports/ para que una regla de vencimiento del bucket no los borre antes.

export const RESULT_FORMATS = {
  xlsx: ASSET_CONTENT_TYPES.xlsx,
  pdf: ASSET_CONTENT_TYPES.pdf,
  zip: ASSET_CONTENT_TYPES.zip,
  json: ASSET_CONTENT_TYPES.json,
} as const;
export type ResultFormat = keyof typeof RESULT_FORMATS;

export const RESULT_PREFIXES = ['exports', 'backups'] as const;
export type ResultPrefix = (typeof RESULT_PREFIXES)[number];

const RESULT_KEY =
  /^(exports|backups)\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|pdf|zip|json)$/;

export function isResultKey(key: string): boolean {
  return RESULT_KEY.test(key);
}

/** {prefijo}/{año}/{mes}/{uuid}.{ext}. Nunca lleva nombres ni datos del contenido. */
export function buildResultKey(
  format: ResultFormat,
  now: Date = new Date(),
  id: string = randomUUID(),
  prefix: ResultPrefix = 'exports',
): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${now.getUTCFullYear()}/${month}/${id.toLowerCase()}.${format}`;
}

function formatOf(key: string): ResultFormat {
  return key.slice(key.lastIndexOf('.') + 1) as ResultFormat;
}

/** Nombre de descarga: solo letras, digitos, espacio, punto, guion y guion bajo; con extension. */
export function safeResultFileName(name: string, format: ResultFormat): string {
  let cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (cleaned === '' || /^\.+$/.test(cleaned)) cleaned = 'resultado';
  if (!cleaned.toLowerCase().endsWith(`.${format}`)) cleaned += `.${format}`;
  return cleaned;
}

function assertResultKey(key: string): void {
  if (!isResultKey(key)) throw new Error('Clave de resultado invalida');
}

@Injectable()
export class JobResultStorage {
  constructor(private readonly storage: StorageService) {}

  /** Sube el resultado y devuelve su tamaño real en bytes. */
  async upload(key: string, body: Buffer | Readable): Promise<number> {
    assertResultKey(key);
    return this.storage.putAsset(key, body);
  }

  /** URL GET firmada de corta duracion (S3_DOWNLOAD_URL_TTL_SECONDS, 60 s por defecto). */
  async createDownloadUrl(key: string, fileName: string): Promise<SignedUrl> {
    assertResultKey(key);
    const format = formatOf(key);
    return this.storage.createAssetDownloadUrl(key, {
      fileName: safeResultFileName(fileName, format),
      contentType: RESULT_FORMATS[format],
    });
  }

  /**
   * Tamaño del resultado en S3, o null si el objeto no existe (404). Otros errores lanzan (503).
   * Lo usa la purga del año para comprobar que cada respaldo sigue ahí (seguridad 5g).
   */
  async size(key: string): Promise<number | null> {
    assertResultKey(key);
    return this.storage.headAsset(key);
  }

  /** Borra el resultado. Un objeto que ya no existe no es error (S3 responde 204). */
  async delete(key: string): Promise<void> {
    assertResultKey(key);
    await this.storage.deleteAsset(key);
  }
}

/** Requiere StorageModule importado en el módulo que lo registra. */
export const resultStorageProviders = [JobResultStorage];
