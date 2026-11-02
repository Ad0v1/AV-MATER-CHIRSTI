import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadStorageConfig } from '../storage/storage.config.js';
import type { StorageConfig } from '../storage/index.js';
import { LOGO_MIME, type LogoFormat } from './logo-image.js';

// Logo institucional en el bucket privado, prefijo institution/ (U5). Fuera de StoredFile (que
// exige courseSectionId) y de StorageService de Dev 3 (solo claves .pdf). Mismo patrón que
// JobResultStorage de la fase 5b: misma configuración S3 y clave sin datos del archivo.

const LOGO_KEY =
  /^institution\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

/**
 * Vigencia de la URL del logo: 10 min. Es información institucional (no personal) y se pinta en
 * cada página; con 60 s una pestaña abierta perdería la imagen al recargar recursos.
 */
export const LOGO_URL_TTL_SECONDS = 600;

export const LOGO_S3 = Symbol('LOGO_S3');
export const LOGO_STORAGE_CONFIG = Symbol('LOGO_STORAGE_CONFIG');

export function isLogoKey(key: string): boolean {
  return LOGO_KEY.test(key);
}

/** institution/{uuid}.{png|jpg}. */
export function buildLogoKey(format: LogoFormat, id: string = randomUUID()): string {
  return `institution/${id.toLowerCase()}.${format}`;
}

function assertLogoKey(key: string): void {
  if (!isLogoKey(key)) throw new Error('Clave de logo invalida');
}

export type LogoUrl = { url: string; expiresAt: string };

@Injectable()
export class InstitutionLogoStorage {
  constructor(
    @Inject(LOGO_S3) private readonly s3: S3Client,
    @Inject(LOGO_STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {}

  async upload(key: string, body: Buffer): Promise<void> {
    assertLogoKey(key);
    const format = key.slice(key.lastIndexOf('.') + 1) as LogoFormat;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: LOGO_MIME[format],
        ContentLength: body.length,
        CacheControl: 'private, max-age=600',
      }),
    );
  }

  /** URL GET firmada (sin red). El tipo de la respuesta sale de la BD, no de lo que guardó S3. */
  async signedUrl(key: string, mime: string): Promise<LogoUrl> {
    assertLogoKey(key);
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: LOGO_URL_TTL_SECONDS });
    return { url, expiresAt: new Date(Date.now() + LOGO_URL_TTL_SECONDS * 1000).toISOString() };
  }

  /** Un objeto que ya no existe no es error (S3 responde 204). */
  async delete(key: string): Promise<void> {
    assertLogoKey(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

export const logoStorageProviders = [
  { provide: LOGO_STORAGE_CONFIG, useFactory: () => loadStorageConfig() },
  {
    provide: LOGO_S3,
    inject: [LOGO_STORAGE_CONFIG],
    useFactory: (config: StorageConfig) =>
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
  },
  InstitutionLogoStorage,
];
