import { BadRequestException } from '@nestjs/common';
import { IMPORT_MSG } from '../users.errors.js';
import type { CellValue, ImportType } from './import.constants.js';

// Columnas de cada plantilla (Decisión 2). Los encabezados pueden ir en cualquier orden.

export const IMPORT_COLUMNS = {
  students: ['correo', 'nombre_completo', 'grado', 'seccion'],
  teachers: ['correo', 'nombre_completo'],
  guardians: ['correo_apoderado', 'nombre_apoderado', 'correo_estudiante'],
} as const satisfies Record<ImportType, readonly string[]>;

export type ColumnName<T extends ImportType> = (typeof IMPORT_COLUMNS)[T][number];

/** Índice (desde 0) de cada columna de la plantilla en el archivo. */
export type ColumnMap<T extends ImportType> = Record<ColumnName<T>, number>;

/** Encabezado normalizado: sin espacios en los extremos, minúsculas, sin tildes, espacios → '_'. */
export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '_');
}

/**
 * Ubica las columnas de la plantilla en la fila de encabezados. 400 si falta una, si sobra una
 * desconocida, si se repite o si una celda no es texto. Las celdas vacías al final se ignoran.
 */
export function mapHeaders<T extends ImportType>(type: T, header: CellValue[]): ColumnMap<T> {
  const expected: readonly string[] = IMPORT_COLUMNS[type];
  const map: Record<string, number> = {};
  header.forEach((cell, index) => {
    if (typeof cell !== 'string') throw new BadRequestException(IMPORT_MSG.headerInvalid);
    const name = normalizeHeader(cell);
    if (name === '') {
      // Una columna sin encabezado entre otras: los datos de esa columna serían EXTRA_CELLS.
      return;
    }
    if (!expected.includes(name)) throw new BadRequestException(IMPORT_MSG.headerUnknown);
    if (name in map) throw new BadRequestException(IMPORT_MSG.headerDuplicate);
    map[name] = index;
  });
  for (const name of expected) {
    if (!(name in map)) throw new BadRequestException(IMPORT_MSG.headerMissing);
  }
  return map as ColumnMap<T>;
}
