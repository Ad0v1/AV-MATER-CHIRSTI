import { BadRequestException } from '@nestjs/common';

// B4: claves que no son PDF de clases, tareas ni entregas. Lista blanca por prefijo y extensión;
// las claves PDF de materials/assignments/submissions/incoming siguen en object-key.util.ts.
//   - exports/ y backups/: resultados de trabajos de Dev 5 ({prefijo}/{año}/{mes}/{uuid}.{ext}).
//   - institution/: logo institucional (institution/{uuid}.{png|jpg}).

export const ASSET_CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
} as const;
export type AssetFormat = keyof typeof ASSET_CONTENT_TYPES;

/** Prefijo → patrón completo de la clave (incluye las extensiones permitidas). */
export const ASSET_KEY_RULES = {
  exports:
    /^exports\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|pdf|zip|json)$/,
  backups:
    /^backups\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(xlsx|pdf|zip|json)$/,
  institution:
    /^institution\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/,
} as const;
export type AssetPrefix = keyof typeof ASSET_KEY_RULES;

export function isAssetKey(key: string): boolean {
  const prefix = key.slice(0, key.indexOf('/'));
  if (!Object.hasOwn(ASSET_KEY_RULES, prefix)) return false;
  return ASSET_KEY_RULES[prefix as AssetPrefix].test(key);
}

export function assertAssetKey(key: string): void {
  if (!isAssetKey(key)) {
    throw new BadRequestException({
      code: 'INVALID_OBJECT_KEY',
      message: 'La clave del archivo no tiene un formato válido.',
    });
  }
}

/** Formato de una clave ya validada con assertAssetKey. */
export function assetFormatOf(key: string): AssetFormat {
  return key.slice(key.lastIndexOf('.') + 1) as AssetFormat;
}

export function isAllowedAssetContentType(value: string): boolean {
  return (Object.values(ASSET_CONTENT_TYPES) as string[]).includes(value);
}
