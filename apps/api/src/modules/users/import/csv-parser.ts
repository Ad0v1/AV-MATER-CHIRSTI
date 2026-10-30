import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { IMPORT_MSG } from '../users.errors.js';
import {
  EXTRA_CELLS_MARKER,
  IMPORT_LIMIT_MSG,
  isEmptyRow,
  MAX_COLUMNS,
  MAX_PHYSICAL_ROWS,
  MAX_ROWS,
  MAX_SHEET_COLUMN,
  type CellValue,
  type SheetRow,
} from './import.constants.js';

// Lector CSV propio (RFC 4180, Decisión 1): comillas, "" dentro de comillas, CRLF/LF/CR,
// separador ',' o ';' según el encabezado. Solo UTF-8 (BOM opcional). Sin dependencias.

export type CsvSeparator = ',' | ';';

/** Separador del archivo: el que más aparece fuera de comillas en la primera línea. */
export function detectSeparator(text: string): CsvSeparator {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/** Texto UTF-8 del archivo, sin BOM. NUL → 415 (binario); otra codificación → 400. */
export function decodeCsv(buffer: Buffer): string {
  if (buffer.includes(0)) throw new UnsupportedMediaTypeException(IMPORT_MSG.binaryCsv);
  try {
    // ignoreBOM: false → el BOM inicial se descarta.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    throw new BadRequestException(IMPORT_MSG.notUtf8);
  }
}

/**
 * Filas del CSV con su número físico de registro (el encabezado es la fila 1). Las filas vacías
 * solo se cuentan, no se guardan (INFORME 3, H3). Límites, todos con 400 en cuanto se pasan:
 * más de MAX_PHYSICAL_ROWS registros (contando los vacíos), más de MAX_SHEET_COLUMN campos en un
 * registro o más de `maxDataRows` filas de datos no vacías. De cada registro se guardan como
 * máximo MAX_COLUMNS campos; si después hay datos, se añade EXTRA_CELLS_MARKER (→ EXTRA_CELLS).
 */
export function parseCsv(buffer: Buffer, maxDataRows: number = MAX_ROWS): SheetRow[] {
  const text = decodeCsv(buffer);
  const separator = detectSeparator(text);
  const rows: SheetRow[] = [];
  let dataRows = 0;
  let row = 0; // número físico del registro en curso - 1

  let cells: CellValue[] = [];
  let fields = 0; // campos del registro en curso (también los que no se guardan)
  let extra = false; // hay datos después de MAX_COLUMNS
  let field = '';
  let quoted = false; // dentro de un campo entre comillas
  let atFieldStart = true;

  const endField = () => {
    if (++fields > MAX_SHEET_COLUMN) throw new BadRequestException(IMPORT_LIMIT_MSG.tooManyFields);
    if (fields <= MAX_COLUMNS) cells.push(field);
    else if (field.trim() !== '') extra = true;
    field = '';
    atFieldStart = true;
  };
  const endRecord = () => {
    endField();
    if (++row > MAX_PHYSICAL_ROWS) throw new BadRequestException(IMPORT_LIMIT_MSG.tooManyLines);
    if (extra) cells.push(EXTRA_CELLS_MARKER);
    if (!isEmptyRow(cells)) {
      if (row > 1 && ++dataRows > maxDataRows) {
        throw new BadRequestException(IMPORT_MSG.tooManyRows);
      }
      rows.push({ row, cells });
    }
    cells = [];
    fields = 0;
    extra = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === separator) {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else {
      // Una comilla en medio de un campo sin comillas se toma como texto (tolerante).
      field += ch;
      atFieldStart = false;
    }
  }
  if (quoted) throw new BadRequestException(IMPORT_MSG.unclosedQuote);
  // Último registro sin salto de línea final.
  if (field !== '' || fields > 0 || !atFieldStart) endRecord();
  return rows;
}
