// Constantes de la importación masiva de usuarios (RF-21, expediente 20261027-dev2-importacion).
// Unidades binarias (D-007): 1 MiB = 1 048 576 bytes.

export const MIB = 1_048_576;

/** Tamaño máximo del archivo subido. */
export const MAX_FILE_BYTES = MIB;
/** Filas de datos (sin encabezado ni filas vacías) por archivo. */
export const MAX_ROWS = 1000;
/** Caracteres por celda. */
export const MAX_CELL_CHARS = 500;
/** Errores de fila que se devuelven; el resto se indica con errorsTruncated. */
export const MAX_ERRORS = 500;
/** Estudiantes por apoderado (igual que el alta individual, RF-20). */
export const MAX_STUDENTS_PER_GUARDIAN = 10;
/** Filas por createMany. */
export const BATCH_SIZE = 500;

/**
 * Filas físicas (contando las vacías) y columnas que se leen por fila. Se cortan antes de acumular
 * nada para que un archivo de 1 MiB no pueda crear millones de objetos (INFORME 3, H2/H3).
 */
export const MAX_PHYSICAL_ROWS = 5000;
export const MAX_COLUMNS = 30;
/** Máximo de columnas de Excel (XFD): más campos en un registro CSV → 400. */
export const MAX_SHEET_COLUMN = 16_384;
/** Máximo de filas de Excel (para validar referencias de rangos). */
export const MAX_SHEET_ROW = 1_048_576;

/**
 * Celda que sustituye a todo lo que hay después de la columna MAX_COLUMNS cuando no está vacío: el
 * validador la ve como dato fuera de la plantilla (EXTRA_CELLS) o encabezado desconocido. NUL no
 * puede venir de un archivo (CSV con NUL → 415; XML no admite NUL).
 */
export const EXTRA_CELLS_MARKER = '\u0000';

/** Guard del XLSX (ZIP): entradas, presupuesto total descomprimido y tope por entrada. */
export const XLSX_MAX_ENTRIES = 100;
export const XLSX_MAX_UNCOMPRESSED_BYTES = 8 * MIB;
export const XLSX_MAX_ENTRY_BYTES = 4 * MIB;
/**
 * Límites de estructura que el guard revisa en el XML antes de ExcelJS, que expande en memoria
 * celdas (<c>), combinaciones (mergeCell), validaciones (sqref) y nombres definidos celda a celda.
 */
export const XLSX_MAX_CELLS = 50_000;
export const XLSX_MAX_MERGES = 500;
export const XLSX_MAX_RANGE_CELLS = 50_000;
/**
 * Hojas del libro (INFORME 7, H9): ExcelJS guarda cada hoja en `_worksheets[sheetId]` y después
 * recorre el arreglo entero; un sheetId enorme (4294967294) lo deja minutos sin responder.
 */
export const XLSX_MAX_SHEETS = 50;
export const XLSX_MAX_SHEET_ID = 1000;
/**
 * Columnas de todo el libro (H10): ExcelJS crea un objeto por columna hasta la mayor columna usada
 * en cada hoja (<col max>, celdas y combinaciones); se suma la de cada hoja.
 */
export const XLSX_MAX_TOTAL_COLUMNS = 3 * MAX_SHEET_COLUMN;
/**
 * Ancho de filas de todo el libro: suma, fila por fila, de la mayor columna con celda (más las
 * celdas sin referencia y las filas de cada combinación). ExcelJS recorre el arreglo de celdas de
 * cada fila hasta esa columna; 5000 filas × 100 columnas caben de sobra.
 */
export const XLSX_MAX_ROW_WIDTH = 500_000;

/**
 * Mensajes fijos de los límites del archivo (sin datos del archivo). Viven aquí y no en
 * users.errors.ts para no tocar archivos fuera de import/ en la corrección (vuelta 1/2).
 */
export const IMPORT_LIMIT_MSG = {
  tooManyLines: 'El archivo supera el máximo de 5000 filas, contando las vacías',
  tooManyFields: 'Una fila del archivo tiene demasiadas columnas',
  xlsxTooComplex:
    'El Excel tiene demasiadas hojas, columnas, celdas, combinaciones, validaciones o nombres definidos; usa la plantilla',
  xlsxEncoding: 'El Excel tiene partes XML con una codificación no admitida (solo UTF-8)',
  xlsxUnicodeName: 'El Excel usa nombres internos con una codificación no admitida',
} as const;

/** Opciones de la transacción del commit. */
export const IMPORT_TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

/** Límite propio de preview y commit (más estricto que el global). */
export const IMPORT_RATE_LIMIT = { default: { limit: 10, ttl: 60_000 } } as const;

/** Límites de multer: los guards corren antes, así que sin sesión nunca se lee el cuerpo. */
export const MULTER_LIMITS = {
  fileSize: MAX_FILE_BYTES,
  files: 1,
  fields: 3,
  parts: 4,
  fieldNameSize: 32,
  fieldSize: 128,
} as const;

export const IMPORT_TYPES = ['students', 'teachers', 'guardians'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** Códigos de error por fila (contrato con la pantalla de F5). */
export const ROW_ERROR_CODES = [
  'REQUIRED',
  'INVALID_EMAIL',
  'EMAIL_DOMAIN',
  'INVALID_NAME',
  'INVALID_GRADE',
  'INVALID_SECTION',
  'SECTION_NOT_FOUND',
  'SECTION_INACTIVE',
  'DUPLICATE_IN_FILE',
  'EMAIL_TAKEN',
  'STUDENT_NOT_FOUND',
  'NOT_STUDENT',
  'STUDENT_WITHDRAWN',
  'SAME_PERSON',
  'NAME_MISMATCH',
  'TOO_MANY_STUDENTS',
  'DUPLICATE_LINK',
  'FORMULA_NOT_ALLOWED',
  'INVALID_CELL',
  'TOO_LONG',
  'EXTRA_CELLS',
] as const;
export type RowErrorCode = (typeof ROW_ERROR_CODES)[number];

/** Mensajes fijos por código: nunca repiten el valor de la celda. */
export const ROW_ERROR_MSG: Record<RowErrorCode, string> = {
  REQUIRED: 'El campo es obligatorio',
  INVALID_EMAIL: 'El correo no es válido',
  EMAIL_DOMAIN: 'El correo no pertenece al dominio institucional',
  INVALID_NAME: 'El nombre no es válido (3 a 120 caracteres, sin empezar por = + - @)',
  INVALID_GRADE: 'El grado debe ser un número entero del 1 al 5',
  INVALID_SECTION: 'La sección debe tener de 1 a 8 letras o dígitos',
  SECTION_NOT_FOUND: 'No existe esa sección en el año académico activo',
  SECTION_INACTIVE: 'La sección está inactiva',
  DUPLICATE_IN_FILE: 'El correo está repetido en el archivo',
  EMAIL_TAKEN: 'Ya existe un usuario con ese correo',
  STUDENT_NOT_FOUND: 'No existe un estudiante con ese correo',
  NOT_STUDENT: 'El usuario de ese correo no es un estudiante',
  STUDENT_WITHDRAWN: 'El estudiante está retirado',
  SAME_PERSON: 'El apoderado y el estudiante deben ser personas distintas',
  NAME_MISMATCH: 'El nombre del apoderado no coincide con el de su primera fila',
  TOO_MANY_STUDENTS: 'El apoderado supera el máximo de 10 estudiantes',
  DUPLICATE_LINK: 'El vínculo entre ese apoderado y ese estudiante está repetido',
  FORMULA_NOT_ALLOWED: 'La celda tiene una fórmula; escribe el valor',
  INVALID_CELL: 'La celda debe ser texto o un número entero',
  TOO_LONG: 'La celda supera los 500 caracteres',
  EXTRA_CELLS: 'La fila tiene datos fuera de las columnas de la plantilla',
};

export type ImportRowError = {
  /** Número de fila física (el encabezado es la fila 1). */
  row: number;
  column: string | null;
  code: RowErrorCode;
  message: string;
};

export type ImportSummary = { users: number; enrollments: number; links: number };

export type ImportReport = {
  type: ImportType;
  format: ImportFormat;
  sha256: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportRowError[];
  errorsTruncated: boolean;
  summary: ImportSummary;
  canConfirm: boolean;
};

export type ImportCommitResult = { type: ImportType; created: ImportSummary };

/** Celda leída: texto, o un problema que impide leerla (solo XLSX). */
export type CellProblem = { problem: 'FORMULA_NOT_ALLOWED' | 'INVALID_CELL' };
export type CellValue = string | CellProblem;
export type SheetRow = { row: number; cells: CellValue[] };

/** Fila vacía: todas sus celdas son texto en blanco (se ignora y no cuenta para el límite). */
export const isEmptyRow = (cells: CellValue[]): boolean =>
  cells.every((cell) => typeof cell === 'string' && cell.trim() === '');
