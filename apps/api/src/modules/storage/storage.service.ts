import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ASSET_CONTENT_TYPES,
  assertAssetKey,
  assetFormatOf,
  isAllowedAssetContentType,
} from './asset-key.util.js';
import {
  ABSOLUTE_MAX_SIZE_BYTES,
  BYTES_PER_MB,
  DEFAULT_MAX_SIZE_BYTES,
  PDF_CONTENT_TYPE,
  PDF_MAGIC_BYTES,
  STORAGE_CLIENT,
  STORAGE_CONFIG,
} from './storage.constants.js';
import type {
  DownloadUrlOptions,
  ObjectHead,
  SignedUrl,
  StorageConfig,
  StoredObjectInfo,
  UploadUrlRequest,
} from './storage.types.js';
import {
  assertValidObjectKey,
  buildContentDisposition,
  safeDownloadFileName,
} from './object-key.util.js';

/**
 * Servicio de almacenamiento privado (RNF-03, RNF-18).
 *
 * Funciona igual con MinIO (local) y Cloudflare R2 (producción) porque ambos usan la API S3.
 * El bucket es privado: los archivos solo se suben y descargan con URLs firmadas de corta duración.
 *
 * Este servicio NO decide permisos. Quien lo llama (controladores de contents/submissions)
 * debe verificar antes rol y pertenencia con los guards de Dev 1.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_CLIENT) private readonly s3: S3Client,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {}

  /** Límite efectivo: el de la tarea, sin superar nunca el tope absoluto (RF-35). */
  effectiveMaxSize(maxSizeBytes?: number): number {
    const requested = maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    return Math.min(requested, ABSOLUTE_MAX_SIZE_BYTES);
  }

  /**
   * URL firmada para subir un PDF con PUT.
   *
   * Se usa PUT (y no POST con política) porque Cloudflare R2 no admite POST.
   * El tamaño y el tipo declarados quedan firmados: si el navegador envía otros, el
   * almacenamiento rechaza la subida. Aun así, inspectObject() vuelve a verificar todo.
   */
  async createUploadUrl(request: UploadUrlRequest): Promise<SignedUrl> {
    assertValidObjectKey(request.key);

    if (request.contentType !== PDF_CONTENT_TYPE) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Solo se aceptan archivos PDF.',
      });
    }

    if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0) {
      throw new BadRequestException({
        code: 'INVALID_FILE_SIZE',
        message: 'El tamaño del archivo no es válido.',
      });
    }

    const maxSize = this.effectiveMaxSize(request.maxSizeBytes);
    if (request.sizeBytes > maxSize) {
      throw this.tooLarge(maxSize);
    }

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.key,
      ContentType: PDF_CONTENT_TYPE,
      ContentLength: request.sizeBytes,
    });

    const ttl = this.config.uploadUrlTtlSeconds;
    const url = await this.sign(command, ttl, new Set(['content-type', 'content-length']));

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': PDF_CONTENT_TYPE },
      expiresAt: this.expiresAt(ttl),
    };
  }

  /**
   * Verifica un objeto ya subido antes de aceptarlo (paso "complete" del contrato).
   * Comprueba que exista, que no supere el límite y que realmente sea un PDF.
   *
   * Pendiente para sprints siguientes:
   *  - validación completa del PDF (no cifrado, legible): RF-34
   *  - escaneo con ClamAV: RF-40
   */
  async inspectObject(key: string, maxSizeBytes?: number): Promise<StoredObjectInfo> {
    assertValidObjectKey(key);

    const head = await this.call(
      () => this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })),
      key,
    );

    const sizeBytes = Number(head.ContentLength ?? 0);
    const maxSize = this.effectiveMaxSize(maxSizeBytes);
    if (sizeBytes <= 0) {
      throw new UnsupportedMediaTypeException({
        code: 'INVALID_PDF',
        message: 'El archivo está vacío.',
      });
    }
    if (sizeBytes > maxSize) {
      throw this.tooLarge(maxSize);
    }

    const header = await this.readFirstBytes(key, PDF_MAGIC_BYTES.length);
    if (header !== PDF_MAGIC_BYTES) {
      throw new UnsupportedMediaTypeException({
        code: 'INVALID_PDF',
        message: 'El archivo no es un PDF válido.',
      });
    }

    return {
      key,
      sizeBytes,
      contentType: head.ContentType,
      etag: head.ETag,
      lastModified: head.LastModified,
    };
  }

  /** URL firmada para descargar o ver un PDF (inline la usa el visor de Dev 4). */
  async createDownloadUrl(key: string, options: DownloadUrlOptions = {}): Promise<SignedUrl> {
    assertValidObjectKey(key);

    const fileName = safeDownloadFileName(options.fileName);
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: PDF_CONTENT_TYPE,
      ResponseContentDisposition: buildContentDisposition(fileName, options.inline ?? false),
    });

    const ttl = this.config.downloadUrlTtlSeconds;
    const url = await this.sign(command, ttl);

    return { url, method: 'GET', headers: {}, expiresAt: this.expiresAt(ttl) };
  }

  /** Borra un objeto. Lo usará la purga de Dev 5 (evento file.purge-requested.v1). */
  async deleteObject(key: string): Promise<void> {
    assertValidObjectKey(key);
    await this.call(
      () => this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })),
      key,
    );
  }

  // --- Añadido en la fase 3b de Dev 3 (29/10/2026) para POST /files/:id/complete ---------

  /** HEAD del objeto: tamaño real y ETag. 404 FILE_NOT_FOUND si no existe; 503 si S3 falla. */
  async headObject(key: string): Promise<ObjectHead> {
    assertValidObjectKey(key);
    const head = await this.call(
      () => this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })),
      key,
    );
    return { sizeBytes: Number(head.ContentLength ?? 0), etag: head.ETag };
  }

  /**
   * Abre el objeto como stream para leerlo de principio a fin (sha256, PDF, antivirus).
   * Con `etag` se lee exactamente la versión inspeccionada con HEAD (If-Match): si alguien la
   * reemplazó entretanto, S3 responde 412 y se traduce a 409 OBJECT_CHANGED.
   */
  async openObjectStream(key: string, etag?: string): Promise<Readable> {
    assertValidObjectKey(key);
    const response = await this.callWithPrecondition(
      () =>
        this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, IfMatch: etag })),
      key,
    );
    if (!response.Body) throw this.unavailable();
    return response.Body as Readable;
  }

  /** Copia un objeto dentro del bucket (cuarentena → prefijo definitivo), solo si el ETag coincide. */
  async copyObject(sourceKey: string, targetKey: string, etag?: string): Promise<void> {
    assertValidObjectKey(sourceKey);
    assertValidObjectKey(targetKey);
    await this.callWithPrecondition(
      () =>
        this.s3.send(
          new CopyObjectCommand({
            Bucket: this.config.bucket,
            Key: targetKey,
            CopySource: `${this.config.bucket}/${sourceKey}`,
            CopySourceIfMatch: etag,
            ContentType: PDF_CONTENT_TYPE,
            MetadataDirective: 'REPLACE',
          }),
        ),
      sourceKey,
    );
  }

  // --- B4 (07/11/2026): objetos que no son PDF de contenidos (exports/, backups/, institution/) ---
  // Lista blanca por prefijo y extensión (asset-key.util.ts). Las validaciones de PDF de arriba no
  // cambian. Solo los usa código del servidor (worker, settings); nunca hay subida firmada.

  /** Sube un objeto del servidor y devuelve su tamaño real en bytes. */
  async putAsset(
    key: string,
    body: Buffer | Readable,
    options: { cacheControl?: string } = {},
  ): Promise<number> {
    assertAssetKey(key);
    const ContentType = ASSET_CONTENT_TYPES[assetFormatOf(key)];
    if (Buffer.isBuffer(body)) {
      await this.call(
        () =>
          this.s3.send(
            new PutObjectCommand({
              Bucket: this.config.bucket,
              Key: key,
              Body: body,
              ContentType,
              ContentLength: body.length,
              CacheControl: options.cacheControl,
            }),
          ),
        key,
      );
      return body.length;
    }
    await this.call(
      () =>
        new Upload({
          client: this.s3,
          params: {
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentType,
            CacheControl: options.cacheControl,
          },
        }).done(),
      key,
    );
    return (await this.headAsset(key)) ?? 0;
  }

  /**
   * URL GET firmada de un objeto de la lista blanca. `fileName` debe venir ya limpio (con su
   * extensión). `contentType` solo puede ser uno de la lista blanca; por defecto, el de la clave.
   */
  async createAssetDownloadUrl(
    key: string,
    options: {
      fileName?: string;
      inline?: boolean;
      contentType?: string;
      ttlSeconds?: number;
    } = {},
  ): Promise<SignedUrl> {
    assertAssetKey(key);
    const expected = ASSET_CONTENT_TYPES[assetFormatOf(key)];
    const contentType = options.contentType ?? expected;
    // El tipo debe ser el del formato de la clave (no basta con estar en la lista blanca).
    if (contentType !== expected || !isAllowedAssetContentType(contentType)) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Tipo de archivo no permitido.',
      });
    }
    const inline = options.inline ?? false;
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: options.fileName
        ? buildContentDisposition(options.fileName, inline)
        : inline
          ? 'inline'
          : 'attachment',
    });
    const ttl = options.ttlSeconds ?? this.config.downloadUrlTtlSeconds;
    const url = await this.sign(command, ttl);
    return { url, method: 'GET', headers: {}, expiresAt: this.expiresAt(ttl) };
  }

  /** Tamaño del objeto, o null si no existe. Otros errores: 503. */
  async headAsset(key: string): Promise<number | null> {
    assertAssetKey(key);
    try {
      const head = await this.call(
        () => this.s3.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })),
        key,
      );
      return Number(head.ContentLength ?? 0);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }

  /** Bytes del objeto; 413 si supera maxBytes (antes y después de leerlo). */
  async readAsset(key: string, maxBytes: number): Promise<Buffer> {
    assertAssetKey(key);
    const res = await this.call(
      () => this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key })),
      key,
    );
    if (res.ContentLength !== undefined && Number(res.ContentLength) > maxBytes) {
      throw this.tooLarge(maxBytes);
    }
    if (!res.Body) throw this.unavailable();
    // Se cuenta el stream: no se confía en ContentLength (puede faltar o mentir).
    const body = res.Body as unknown as Partial<AsyncIterable<Uint8Array>> & {
      destroy?: () => void;
      transformToByteArray: () => Promise<Uint8Array>;
    };
    if (typeof body[Symbol.asyncIterator] !== 'function') {
      // Cuerpo no iterable (no ocurre con el SDK en Node): se lee y se valida el tamaño real.
      const bytes = Buffer.from(await body.transformToByteArray());
      if (bytes.length > maxBytes) throw this.tooLarge(maxBytes);
      return bytes;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > maxBytes) {
        body.destroy?.();
        throw this.tooLarge(maxBytes);
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
  }

  /** Borra un objeto de la lista blanca. Si ya no existe no es error (S3 responde 204). */
  async deleteAsset(key: string): Promise<void> {
    assertAssetKey(key);
    await this.call(
      () => this.s3.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })),
      key,
    );
  }

  /** Para el health check y Uptime Kuma (Dev 1). */
  async isHealthy(): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return true;
    } catch (error) {
      this.logger.warn(`Bucket "${this.config.bucket}" no disponible: ${this.describe(error)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------

  private async readFirstBytes(key: string, length: number): Promise<string> {
    const response = await this.call(
      () =>
        this.s3.send(
          new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Range: `bytes=0-${length - 1}`,
          }),
        ),
      key,
    );
    if (!response.Body) return '';
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes).subarray(0, length).toString('latin1');
  }

  private async sign(
    command: PutObjectCommand | GetObjectCommand,
    expiresIn: number,
    signableHeaders?: Set<string>,
  ): Promise<string> {
    try {
      return await getSignedUrl(this.s3, command, { expiresIn, signableHeaders });
    } catch (error) {
      this.logger.error(`No se pudo firmar la URL: ${this.describe(error)}`);
      throw this.unavailable();
    }
  }

  /** Ejecuta una llamada a S3 y traduce los errores a los códigos del contrato (docs/03). */
  private async call<T>(operation: () => Promise<T>, key: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException({
          code: 'FILE_NOT_FOUND',
          message: 'El archivo no existe o todavía no se terminó de subir.',
        });
      }
      this.logger.error(`Error de almacenamiento con "${key}": ${this.describe(error)}`);
      throw this.unavailable();
    }
  }

  private async callWithPrecondition<T>(operation: () => Promise<T>, key: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
      if (e?.name === 'PreconditionFailed' || e?.$metadata?.httpStatusCode === 412) {
        throw new ConflictException({
          code: 'OBJECT_CHANGED',
          message: 'El archivo cambió mientras se revisaba. Vuelve a subirlo.',
        });
      }
      return this.call(() => Promise.reject(error as Error), key);
    }
  }

  private isNotFound(error: unknown): boolean {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
    return (
      e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private tooLarge(maxSize: number): PayloadTooLargeException {
    const mb = Math.round((maxSize / BYTES_PER_MB) * 100) / 100;
    return new PayloadTooLargeException({
      code: 'FILE_TOO_LARGE',
      message: `El archivo supera el límite de ${mb} MB.`,
    });
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'STORAGE_UNAVAILABLE',
      message:
        'El almacenamiento no está disponible en este momento. Intenta de nuevo en unos minutos.',
    });
  }

  private expiresAt(ttlSeconds: number): string {
    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
  }
}
