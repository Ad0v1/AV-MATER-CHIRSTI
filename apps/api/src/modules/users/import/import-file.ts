import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { IMPORT_MSG } from '../users.errors.js';
import { parseCsv } from './csv-parser.js';
import { MAX_FILE_BYTES, type ImportFormat, type SheetRow } from './import.constants.js';
import { readXlsx } from './xlsx-reader.js';

// Archivo subido por multer en memoria. Tipo local mínimo (sin @types/multer, Decisión 4).
// `originalname` solo se usa para la extensión: nunca va al log ni a una respuesta.
export type UploadedImportFile = { originalname: string; size: number; buffer: Buffer };

export type ParsedImportFile = { format: ImportFormat; sha256: string; rows: SheetRow[] };

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const sha256Of = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');

/**
 * Formato por extensión y bytes mágicos, que deben coincidir (Decisión 1). Solo .xlsx y .csv:
 * .xls, .xlsm, .ods y cualquier otra → 415. Un .xlsx cifrado es un contenedor OLE (no ZIP) → 415.
 */
export function detectFormat(originalname: string, buffer: Buffer): ImportFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(originalname)?.[1]?.toLowerCase();
  const isZip = buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC);
  if (ext === 'xlsx') {
    if (!isZip) throw new UnsupportedMediaTypeException(IMPORT_MSG.formatMismatch);
    return 'xlsx';
  }
  if (ext === 'csv') {
    if (isZip) throw new UnsupportedMediaTypeException(IMPORT_MSG.formatMismatch);
    return 'csv';
  }
  throw new UnsupportedMediaTypeException(IMPORT_MSG.unsupportedFormat);
}

/**
 * Valida tamaño y formato, calcula el SHA-256 y lee las filas (CSV o XLSX). Con `expectedSha256`
 * (confirmación) responde 409 antes de leer las filas si el archivo no es el de la vista previa.
 */
export async function parseImportFile(
  file: UploadedImportFile | undefined,
  expectedSha256?: string,
): Promise<ParsedImportFile> {
  if (!file || !Buffer.isBuffer(file.buffer))
    throw new BadRequestException(IMPORT_MSG.fileRequired);
  // multer ya corta en 1 MiB; esta comprobación cubre cualquier otro camino.
  if (file.buffer.length > MAX_FILE_BYTES) throw new PayloadTooLargeException();
  if (file.buffer.length === 0) throw new BadRequestException(IMPORT_MSG.emptyFile);
  const format = detectFormat(file.originalname ?? '', file.buffer);
  const sha256 = sha256Of(file.buffer);
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
    throw new ConflictException(IMPORT_MSG.hashMismatch);
  }
  const rows = format === 'csv' ? parseCsv(file.buffer) : await readXlsx(file.buffer);
  return { format, sha256, rows };
}
