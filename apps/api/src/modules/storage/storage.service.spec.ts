import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { StorageService } from './storage.service.js';
import type { StorageConfig } from './storage.types.js';
import {
  ABSOLUTE_MAX_SIZE_BYTES,
  BYTES_PER_MB,
  DEFAULT_MAX_SIZE_BYTES,
} from './storage.constants.js';
import {
  buildContentDisposition,
  buildObjectKey,
  isValidObjectKey,
  safeDownloadFileName,
} from './object-key.util.js';

type SendMock = MockInstance<(command: unknown) => Promise<unknown>>;

const config: StorageConfig = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'aula-privado',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
  forcePathStyle: true,
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 120,
};

// Firmar URLs es un cálculo local: no hace falta que MinIO esté levantado.
function createService(): { service: StorageService; send: SendMock } {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const send = vi.spyOn(s3, 'send') as unknown as SendMock;
  return { service: new StorageService(s3, config), send };
}

const KEY = buildObjectKey(
  'submissions',
  new Date('2026-10-15T12:00:00Z'),
  '3f2c1a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f',
);

function mockStoredPdf(send: SendMock, sizeBytes: number, firstBytes = '%PDF-'): void {
  send.mockImplementation(async (command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      return { ContentLength: sizeBytes, ContentType: 'application/pdf', ETag: '"abc"' };
    }
    if (command instanceof GetObjectCommand) {
      return {
        Body: {
          transformToByteArray: async () => new Uint8Array(Buffer.from(firstBytes, 'latin1')),
        },
      };
    }
    throw new Error('Comando no esperado');
  });
}

describe('object-key.util', () => {
  it('genera claves sin el nombre original del archivo', () => {
    expect(KEY).toBe('submissions/2026/10/3f2c1a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f.pdf');
    expect(isValidObjectKey(KEY)).toBe(true);
  });

  it('rechaza claves con rutas o prefijos no permitidos', () => {
    expect(isValidObjectKey('../secreto.pdf')).toBe(false);
    expect(isValidObjectKey('otros/2026/10/3f2c1a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f.pdf')).toBe(false);
    expect(isValidObjectKey('submissions/2026/13/3f2c1a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f.pdf')).toBe(
      false,
    );
  });

  it('limpia nombres de descarga peligrosos y agrega .pdf', () => {
    expect(safeDownloadFileName('Tarea 1 / Matemática')).toBe('Tarea 1 _ Matemática.pdf');
    expect(safeDownloadFileName('../../etc/passwd')).toBe('.._.._etc_passwd.pdf');
    expect(safeDownloadFileName('nombre\u0000raro')).toBe('nombreraro.pdf');
    expect(safeDownloadFileName('')).toBe('archivo.pdf');
    expect(safeDownloadFileName('...')).toBe('archivo.pdf');
  });

  it('arma Content-Disposition compatible con tildes y ñ', () => {
    const header = buildContentDisposition('Año lectivo.pdf', false);
    expect(header).toContain('attachment;');
    expect(header).toContain('filename="Ano lectivo.pdf"');
    expect(header).toContain("filename*=UTF-8''A%C3%B1o%20lectivo.pdf");
  });
});

describe('StorageService.createUploadUrl', () => {
  it('devuelve una URL PUT firmada para un PDF dentro del límite', async () => {
    const { service } = createService();
    const result = await service.createUploadUrl({
      key: KEY,
      contentType: 'application/pdf',
      sizeBytes: 2 * BYTES_PER_MB,
    });
    expect(result.method).toBe('PUT');
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.url).toContain('aula-privado');
    expect(result.headers['Content-Type']).toBe('application/pdf');
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rechaza archivos que no son PDF (415)', async () => {
    const { service } = createService();
    await expect(
      service.createUploadUrl({ key: KEY, contentType: 'image/png', sizeBytes: 1000 }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rechaza archivos más grandes que el límite por defecto de 20 MB (413)', async () => {
    const { service } = createService();
    await expect(
      service.createUploadUrl({
        key: KEY,
        contentType: 'application/pdf',
        sizeBytes: DEFAULT_MAX_SIZE_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('nunca supera el tope absoluto de 50 MB aunque la tarea pida más (RF-35)', async () => {
    const { service } = createService();
    expect(service.effectiveMaxSize(100 * BYTES_PER_MB)).toBe(ABSOLUTE_MAX_SIZE_BYTES);
    await expect(
      service.createUploadUrl({
        key: KEY,
        contentType: 'application/pdf',
        sizeBytes: ABSOLUTE_MAX_SIZE_BYTES + 1,
        maxSizeBytes: 100 * BYTES_PER_MB,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rechaza tamaños inválidos y claves mal formadas (400)', async () => {
    const { service } = createService();
    await expect(
      service.createUploadUrl({ key: KEY, contentType: 'application/pdf', sizeBytes: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createUploadUrl({
        key: 'mi tarea.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StorageService.inspectObject', () => {
  it('acepta un PDF real dentro del límite', async () => {
    const { service, send } = createService();
    mockStoredPdf(send, 5 * BYTES_PER_MB);
    const info = await service.inspectObject(KEY);
    expect(info.sizeBytes).toBe(5 * BYTES_PER_MB);
    expect(info.key).toBe(KEY);
  });

  it('rechaza un archivo que dice ser PDF pero no lo es (415)', async () => {
    const { service, send } = createService();
    mockStoredPdf(send, 1000, 'PK\u0003\u0004\u0014');
    await expect(service.inspectObject(KEY)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rechaza un archivo subido que supera el límite de la tarea (413)', async () => {
    const { service, send } = createService();
    mockStoredPdf(send, 11 * BYTES_PER_MB);
    await expect(service.inspectObject(KEY, 10 * BYTES_PER_MB)).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('responde 404 si el archivo no se terminó de subir', async () => {
    const { service, send } = createService();
    send.mockRejectedValue(Object.assign(new Error('Not Found'), { name: 'NotFound' }));
    await expect(service.inspectObject(KEY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 503 si el almacenamiento está caído', async () => {
    const { service, send } = createService();
    send.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(service.inspectObject(KEY)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('StorageService.createDownloadUrl', () => {
  it('firma una URL GET con nombre de descarga seguro', async () => {
    const { service } = createService();
    const result = await service.createDownloadUrl(KEY, { fileName: 'Entrega de José' });
    expect(result.method).toBe('GET');
    expect(result.url).toContain('X-Amz-Signature=');
    expect(decodeURIComponent(result.url)).toContain('attachment;');
  });

  it('permite abrir el PDF en el navegador para el visor (inline)', async () => {
    const { service } = createService();
    const result = await service.createDownloadUrl(KEY, { inline: true });
    expect(decodeURIComponent(result.url)).toContain('inline;');
  });
});

describe('StorageService.isHealthy', () => {
  it('devuelve false sin lanzar error cuando el bucket no responde', async () => {
    const { service, send } = createService();
    send.mockRejectedValue(new Error('timeout'));
    await expect(service.isHealthy()).resolves.toBe(false);
  });
});
