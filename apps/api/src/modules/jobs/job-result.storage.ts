import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadStorageConfig } from '../storage/storage.config.js';
import { buildContentDisposition } from '../storage/object-key.util.js';
import type { SignedUrl, StorageConfig } from '../storage/index.js';

// Resultados de los trabajos (XLSX, PDF, ZIP, JSON) en el bucket privado, prefijo exports/.
// StorageService de Dev 3 solo acepta claves .pdf de materiales y entregas, asi que los
// resultados usan este adaptador con la misma configuracion S3 y la misma vigencia de URL (60 s).

export const RESULT_FORMATS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
} as const;
export type ResultFormat = keyof typeof RESULT_FORMATS;

const RESULT_KEY =
  /^exports\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|pdf|zip|json)$/;

export const RESULT_S3 = Symbol('RESULT_S3');
export const RESULT_STORAGE_CONFIG = Symbol('RESULT_STORAGE_CONFIG');

export function isResultKey(key: string): boolean {
  return RESULT_KEY.test(key);
}

/** exports/{año}/{mes}/{uuid}.{ext}. Nunca lleva nombres ni datos del contenido. */
export function buildResultKey(
  format: ResultFormat,
  now: Date = new Date(),
  id: string = randomUUID(),
): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `exports/${now.getUTCFullYear()}/${month}/${id.toLowerCase()}.${format}`;
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
  private readonly logger = new Logger(JobResultStorage.name);

  constructor(
    @Inject(RESULT_S3) private readonly s3: S3Client,
    @Inject(RESULT_STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {}

  /** Sube el resultado y devuelve su tamaño real en bytes. */
  async upload(key: string, body: Buffer | Readable): Promise<number> {
    assertResultKey(key);
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: RESULT_FORMATS[formatOf(key)],
      },
    });
    await upload.done();
    if (Buffer.isBuffer(body)) return body.length;
    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    return Number(head.ContentLength ?? 0);
  }

  /** URL GET firmada de corta duracion (S3_DOWNLOAD_URL_TTL_SECONDS, 60 s por defecto). */
  async createDownloadUrl(key: string, fileName: string): Promise<SignedUrl> {
    assertResultKey(key);
    const format = formatOf(key);
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: RESULT_FORMATS[format],
      ResponseContentDisposition: buildContentDisposition(
        safeResultFileName(fileName, format),
        false,
      ),
    });
    const ttl = this.config.downloadUrlTtlSeconds;
    try {
      const url = await getSignedUrl(this.s3, command, { expiresIn: ttl });
      return {
        url,
        method: 'GET',
        headers: {},
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    } catch (error) {
      this.logger.error(`No se pudo firmar la URL del resultado: ${describe(error)}`);
      throw new ServiceUnavailableException({
        code: 'STORAGE_UNAVAILABLE',
        message: 'El almacenamiento no está disponible. Intenta más tarde.',
      });
    }
  }

  /** Borra el resultado. Un objeto que ya no existe no es error (S3 responde 204). */
  async delete(key: string): Promise<void> {
    assertResultKey(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export const resultStorageProviders = [
  { provide: RESULT_STORAGE_CONFIG, useFactory: () => loadStorageConfig() },
  {
    provide: RESULT_S3,
    inject: [RESULT_STORAGE_CONFIG],
    useFactory: (config: StorageConfig) =>
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
  },
  JobResultStorage,
];
