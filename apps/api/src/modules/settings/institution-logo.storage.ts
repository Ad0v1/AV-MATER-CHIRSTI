import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/index.js';
import { LOGO_MAX_BYTES, type LogoFormat } from './logo-image.js';

// Logo institucional en el bucket privado, prefijo institution/ (U5). Fuera de StoredFile (que
// exige courseSectionId). Desde B4 (07/11/2026) delega en StorageService (lista blanca
// institution/{uuid}.{png|jpg}); la clave no lleva datos del archivo.

const LOGO_KEY =
  /^institution\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

/**
 * Vigencia de la URL del logo: 10 min. Es información institucional (no personal) y se pinta en
 * cada página; con 60 s una pestaña abierta perdería la imagen al recargar recursos.
 */
export const LOGO_URL_TTL_SECONDS = 600;

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
  constructor(private readonly storage: StorageService) {}

  async upload(key: string, body: Buffer): Promise<void> {
    assertLogoKey(key);
    await this.storage.putAsset(key, body, { cacheControl: 'private, max-age=600' });
  }

  /** URL GET firmada (sin red). El tipo de la respuesta sale de la BD, no de lo que guardó S3. */
  async signedUrl(key: string, mime: string): Promise<LogoUrl> {
    assertLogoKey(key);
    const signed = await this.storage.createAssetDownloadUrl(key, {
      inline: true,
      contentType: mime,
      ttlSeconds: LOGO_URL_TTL_SECONDS,
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }

  /**
   * Bytes del logo para embeberlo en los reportes (RF-58). Rechaza objetos mayores que
   * LOGO_MAX_BYTES (ya se validó al subirlo, U5; esto evita cargar algo inesperado en memoria).
   */
  async download(key: string): Promise<Buffer> {
    assertLogoKey(key);
    try {
      return await this.storage.readAsset(key, LOGO_MAX_BYTES);
    } catch {
      throw new Error('Logo invalido');
    }
  }

  /** Un objeto que ya no existe no es error (S3 responde 204). */
  async delete(key: string): Promise<void> {
    assertLogoKey(key);
    await this.storage.deleteAsset(key);
  }
}

/** Requiere StorageModule importado en el módulo que lo registra. */
export const logoStorageProviders = [InstitutionLogoStorage];
