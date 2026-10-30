import { BadRequestException, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { IMPORT_MSG } from '../users.errors.js';
import {
  EXTRA_CELLS_MARKER,
  IMPORT_LIMIT_MSG,
  isEmptyRow,
  MAX_COLUMNS,
  MAX_PHYSICAL_ROWS,
  MAX_ROWS,
  type CellValue,
  type SheetRow,
} from './import.constants.js';
import { assertSafeXlsx } from './xlsx-guard.js';

// Lector XLSX (Decisión 1): primero el guard del ZIP, luego ExcelJS en memoria. Solo la primera
// hoja. Fórmula → FORMULA_NOT_ALLOWED; fecha, booleano o error → INVALID_CELL; richText
// concatenado; hipervínculo → su texto; número solo si es entero.

const logger = new Logger('UserImport');
const { ValueType } = ExcelJS;

const FORMULA: CellValue = { problem: 'FORMULA_NOT_ALLOWED' };
const INVALID: CellValue = { problem: 'INVALID_CELL' };

type RichTextLike = { richText?: Array<{ text?: unknown }> };

const richTextOf = (value: unknown): string =>
  ((value as RichTextLike | null)?.richText ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');

/** Valor de una celda de ExcelJS convertido a texto o a un problema. */
export function cellToValue(cell: ExcelJS.Cell): CellValue {
  switch (cell.type) {
    case ValueType.Null:
    case ValueType.Merge:
      return '';
    case ValueType.String:
    case ValueType.SharedString:
      return typeof cell.value === 'string' ? cell.value : richTextOf(cell.value);
    case ValueType.RichText:
      return richTextOf(cell.value);
    case ValueType.Number: {
      const n = cell.value as number;
      return Number.isSafeInteger(n) ? String(n) : INVALID;
    }
    case ValueType.Hyperlink: {
      const text = (cell.value as { text?: unknown } | null)?.text;
      if (typeof text === 'string') return text;
      return richTextOf(text);
    }
    case ValueType.Formula:
      return FORMULA;
    default:
      // Date, Boolean, Error y cualquier tipo nuevo.
      return INVALID;
  }
}

/**
 * Celdas de una fila desde la columna A, como máximo MAX_COLUMNS. Solo recorre las celdas que
 * existen (nunca crea celdas con getCell): si hay datos más allá de MAX_COLUMNS se añade
 * EXTRA_CELLS_MARKER, que el validador convierte en EXTRA_CELLS.
 */
export function rowToCells(row: ExcelJS.Row): CellValue[] {
  const cells: CellValue[] = Array.from({ length: Math.min(row.cellCount, MAX_COLUMNS) }, () => '');
  let extra = false;
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col <= MAX_COLUMNS) {
      cells[col - 1] = cellToValue(cell);
    } else if (!extra) {
      const value = cellToValue(cell);
      extra = typeof value !== 'string' || value.trim() !== '';
    }
  });
  if (extra) cells.push(EXTRA_CELLS_MARKER);
  return cells;
}

/**
 * Filas de la primera hoja con su número físico (encabezado = 1); cada fila trae sus celdas desde
 * la columna A. Filas físicas más allá de MAX_PHYSICAL_ROWS → 400 sin recorrerlas (el guard ya las
 * rechaza antes de cargar; esto es una segunda barrera). Más de `maxDataRows` filas de datos no
 * vacías → 400.
 */
export async function readXlsx(
  buffer: Buffer,
  maxDataRows: number = MAX_ROWS,
): Promise<SheetRow[]> {
  assertSafeXlsx(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    // Los tipos de exceljs declaran su propio Buffer (extends ArrayBuffer); en Node acepta el Buffer.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error: unknown) {
    // Solo el nombre del error: el mensaje de la librería puede citar contenido del archivo.
    logger.warn(`No se pudo leer el Excel: ${error instanceof Error ? error.name : typeof error}`);
    throw new BadRequestException(IMPORT_MSG.damagedXlsx);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException(IMPORT_MSG.noSheet);

  if (sheet.rowCount > MAX_PHYSICAL_ROWS) {
    throw new BadRequestException(IMPORT_LIMIT_MSG.tooManyLines);
  }

  const rows: SheetRow[] = [];
  let dataRows = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_PHYSICAL_ROWS) throw new BadRequestException(IMPORT_LIMIT_MSG.tooManyLines);
    const cells = rowToCells(row);
    if (isEmptyRow(cells)) return; // no se acumulan filas vacías
    if (rowNumber > 1 && ++dataRows > maxDataRows) {
      throw new BadRequestException(IMPORT_MSG.tooManyRows);
    }
    rows.push({ row: rowNumber, cells });
  });
  return rows;
}
