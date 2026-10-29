import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { ObjectScope } from './storage.types.js';

const KEY_PATTERN =
  /^(materials|assignments|submissions)\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/**
 * Genera la clave del objeto en el bucket: {scope}/{año}/{mes}/{uuid}.pdf
 * El nombre original del archivo NUNCA forma parte de la clave.
 */
export function buildObjectKey(
  scope: ObjectScope,
  now: Date = new Date(),
  id: string = randomUUID(),
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${scope}/${year}/${month}/${id.toLowerCase()}.pdf`;
}

export function isValidObjectKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function assertValidObjectKey(key: string): void {
  if (!isValidObjectKey(key)) {
    throw new BadRequestException({
      code: 'INVALID_OBJECT_KEY',
      message: 'La clave del archivo no tiene un formato válido.',
    });
  }
}

function removeControlChars(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

/**
 * Limpia el nombre que verá el usuario al descargar.
 * Quita separadores de ruta, comillas y caracteres de control, y asegura la extensión .pdf.
 */
export function safeDownloadFileName(name: string | undefined, fallback = 'archivo.pdf'): string {
  if (!name) return fallback;
  let cleaned = removeControlChars(name.normalize('NFC'))
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || /^\.+$/.test(cleaned)) return fallback;
  if (!cleaned.toLowerCase().endsWith('.pdf')) cleaned += '.pdf';
  if (cleaned.length > 150) cleaned = `${cleaned.slice(0, 146)}.pdf`;
  return cleaned;
}

/** Cabecera Content-Disposition compatible con tildes y ñ (RFC 6266 / RFC 5987). */
export function buildContentDisposition(fileName: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/"/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
