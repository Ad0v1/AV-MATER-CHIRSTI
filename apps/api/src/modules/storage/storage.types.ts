import { OBJECT_SCOPES } from './storage.constants';

/** Prefijo del objeto: materiales (clases/lecturas), adjuntos de tarea o entregas. */
export type ObjectScope = (typeof OBJECT_SCOPES)[number];

export interface StorageConfig {
  /** Vacío para AWS; http://minio:9000 en local; https://<cuenta>.r2.cloudflarestorage.com en R2. */
  endpoint?: string;
  /** "us-east-1" con MinIO, "auto" con R2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** true con MinIO. */
  forcePathStyle: boolean;
  uploadUrlTtlSeconds: number;
  downloadUrlTtlSeconds: number;
}

export interface UploadUrlRequest {
  /** Clave generada con buildObjectKey(); nunca a partir del nombre que manda el usuario. */
  key: string;
  /** Tipo declarado por el cliente. Solo se acepta application/pdf. */
  contentType: string;
  /** Tamaño declarado por el cliente. Queda firmado en la URL. */
  sizeBytes: number;
  /** Límite de la tarea. Si falta se usa el valor por defecto; nunca supera el tope absoluto. */
  maxSizeBytes?: number;
}

export interface SignedUrl {
  url: string;
  method: 'PUT' | 'GET';
  /** Cabeceras que el navegador debe enviar tal cual. */
  headers: Record<string, string>;
  /** ISO-8601. */
  expiresAt: string;
}

export interface StoredObjectInfo {
  key: string;
  sizeBytes: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface DownloadUrlOptions {
  /** Nombre que verá el usuario al descargar. Se limpia antes de usarse. */
  fileName?: string;
  /** true: el navegador lo abre (visor PDF de Dev 4). false: lo descarga. */
  inline?: boolean;
}
