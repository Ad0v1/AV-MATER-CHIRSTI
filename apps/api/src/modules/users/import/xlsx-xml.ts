import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { IMPORT_MSG } from '../users.errors.js';
import {
  IMPORT_LIMIT_MSG,
  MAX_PHYSICAL_ROWS,
  MAX_SHEET_COLUMN,
  MAX_SHEET_ROW,
  XLSX_MAX_CELLS,
  XLSX_MAX_MERGES,
  XLSX_MAX_RANGE_CELLS,
  XLSX_MAX_ROW_WIDTH,
  XLSX_MAX_SHEET_ID,
  XLSX_MAX_SHEETS,
  XLSX_MAX_TOTAL_COLUMNS,
} from './import.constants.js';

// Revisión de las partes XML de un .xlsx antes de ExcelJS (INFORME 3, H2 y H4). ExcelJS 4.4.0 carga
// el libro entero y expande en memoria, celda a celda, las combinaciones (mergeCell), las
// validaciones de datos (sqref), las columnas (<col min max>) y los nombres definidos del libro:
// un archivo de 1,5 KB con `<mergeCell ref="A1:XFD5000"/>` o un nombre definido sobre toda la hoja
// agota la memoria del proceso. Aquí se cuentan y se acotan ANTES de cargar, sobre el texto ya
// descomprimido. La lectura es deliberadamente más estricta que ExcelJS: cualquier referencia que
// no tenga la forma esperada se rechaza (400) en vez de intentar adivinar cómo la interpretaría.

/** Contadores de todo el libro (todas las hojas suman). */
export type XlsxStructureBudget = {
  rows: number;
  cells: number;
  merges: number;
  rangeCells: number;
  /** Suma, hoja por hoja, de la mayor columna usada (H10). */
  columns: number;
  /** Suma, fila por fila, del largo del arreglo de celdas que ExcelJS crea en cada fila. */
  rowWidth: number;
};

export const newStructureBudget = (): XlsxStructureBudget => ({
  rows: 0,
  cells: 0,
  merges: 0,
  rangeCells: 0,
  columns: 0,
  rowWidth: 0,
});

// --- Partes que ExcelJS procesa (H11) ---
// ExcelJS 4.4.0 (lib/xlsx/xlsx.js, load) solo interpreta las partes de abajo: las demás (p. ej.
// customXml/, docProps/custom.xml o [Content_Types].xml) las lee como texto y las descarta, así que
// para ellas basta con el tamaño y el CRC del guard. Nombres fijos: ExcelJS los compara tal cual
// (tras quitar una '/' inicial que el guard ya rechaza); aquí, sin distinguir mayúsculas.
const EXCELJS_FIXED_PARTS = new Set([
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/sharedstrings.xml',
  'xl/styles.xml',
  'docprops/app.xml',
  'docprops/core.xml',
]);
// Las mismas expresiones de ExcelJS (xlsx.js:361-401), copiadas tal cual (sin anclar y con su '.'
// sin escapar en las .rels de hojas) y con la bandera 'i' para cubrir de más, no de menos. Los
// temas (xl/theme) no se interpretan como XML, pero se guardan como texto: se revisan igual.
const WORKSHEET_PART = /xl\/worksheets\/sheet(\d+)[.]xml/i;
const COMMENTS_PART = /xl\/(comments\d+)[.]xml/i;
const EXCELJS_PATTERN_PARTS = [
  WORKSHEET_PART,
  /xl\/worksheets\/_rels\/sheet(\d+)[.]xml.rels/i,
  /xl\/theme\/([a-zA-Z0-9]+)[.]xml/i,
  /xl\/drawings\/([a-zA-Z0-9]+)[.]xml/i,
  COMMENTS_PART,
  /xl\/tables\/(table\d+)[.]xml/i,
  /xl\/drawings\/_rels\/([a-zA-Z0-9]+)[.]xml[.]rels/i,
  /xl\/drawings\/(vmlDrawing\d+)[.]vml/i,
];
const WORKBOOK_PART = 'xl/workbook.xml';

/**
 * Partes que ExcelJS interpreta (o guarda como texto): solo a estas se les exige UTF-8 y se les
 * buscan declaraciones prohibidas y límites de estructura (H11). Las imágenes de xl/media/ no se
 * interpretan y quedan fuera, salvo que su nombre coincida además con otra expresión (entonces
 * ExcelJS también las interpretaría).
 */
export const isExcelJsXmlPart = (name: string): boolean =>
  EXCELJS_FIXED_PARTS.has(name.toLowerCase()) ||
  EXCELJS_PATTERN_PARTS.some((pattern) => pattern.test(name));

const FORBIDDEN_DECL = /<!\s*(doctype|entity)/i;
const UTF8_BOM = [0xef, 0xbb, 0xbf];

const tooComplex = () => new BadRequestException(IMPORT_LIMIT_MSG.xlsxTooComplex);
const tooManyLines = () => new BadRequestException(IMPORT_LIMIT_MSG.tooManyLines);
const badEncoding = () => new UnsupportedMediaTypeException(IMPORT_LIMIT_MSG.xlsxEncoding);

/**
 * Texto de una parte XML. 415 si no empieza (tras un BOM UTF-8 opcional y espacios) por '<' en
 * ASCII, si tiene un byte NUL (UTF-16/32) o si no es UTF-8 válido: ExcelJS decodifica siempre como
 * UTF-8, así que otra codificación solo serviría para esconder declaraciones del filtro.
 */
export function decodeXmlPart(data: Buffer): string {
  let start = 0;
  if (UTF8_BOM.every((byte, i) => data[i] === byte)) start = 3;
  let i = start;
  while (
    i < data.length &&
    (data[i] === 0x20 || data[i] === 0x09 || data[i] === 0x0a || data[i] === 0x0d)
  ) {
    i++;
  }
  if (i >= data.length || data[i] !== 0x3c || data.includes(0)) throw badEncoding();
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data.subarray(start));
  } catch {
    throw badEncoding();
  }
}

// --- Lectura mínima de etiquetas y atributos (respetando comillas) ---

/** Etiquetas de apertura `<prefijo:nombre ...>` de los nombres dados (sin distinguir mayúsculas). */
function tagRegex(names: string): RegExp {
  // Sin '<' dentro de la etiqueta ni de los valores (XML no lo admite): cada intento se detiene en el
  // siguiente '<' y la búsqueda es lineal aunque el texto sea hostil.
  return new RegExp(
    `<(?:[\\w.-]+:)?(?:${names})(?=[\\s/>])((?:[^<>"']|"[^<"]*"|'[^<']*')*)>`,
    'gi',
  );
}
// El lookbehind obliga a empezar al principio del nombre (sin retroceso cuadrático).
const ATTRIBUTE = /(?<![\w:.-])([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const VALID_ENTITY = /&(?:#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi;
const NAMED_ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Texto con las referencias de carácter de XML resueltas; 400 si hay una que no es válida. */
export function decodeXmlEntities(value: string): string {
  if (value.replace(VALID_ENTITY, '').includes('&')) throw tooComplex();
  try {
    return value.replace(VALID_ENTITY, (entity) => {
      const body = entity.slice(1, -1).toLowerCase();
      if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
      if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
      return NAMED_ENTITY[body];
    });
  } catch {
    throw tooComplex(); // código fuera de Unicode
  }
}

/** Valores (ya decodificados) de un atributo; todos, por si viene repetido. */
function attributeValues(attributes: string, name: string): string[] {
  const values: string[] = [];
  for (const match of attributes.matchAll(ATTRIBUTE)) {
    const attrName = match[1].includes(':') ? match[1].slice(match[1].indexOf(':') + 1) : match[1];
    if (attrName.toLowerCase() === name.toLowerCase()) {
      values.push(decodeXmlEntities(match[2] ?? match[3] ?? ''));
    }
  }
  return values;
}

// --- Referencias de celdas ---

/** Número de columna de unas letras (A = 1). */
function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

const CELL_REF = /^\$?([A-Z]{1,3})\$?([0-9]{1,7})$/;

type CellRef = { col: number; row: number };

/** Referencia de una celda dentro de los límites de Excel; 400 si no tiene la forma esperada. */
function parseCellRef(ref: string): CellRef {
  const match = CELL_REF.exec(ref);
  if (!match) throw tooComplex();
  const col = columnNumber(match[1]);
  const row = Number(match[2]);
  if (col < 1 || col > MAX_SHEET_COLUMN || row < 1 || row > MAX_SHEET_ROW) throw tooComplex();
  return { col, row };
}

/** Celdas que abarca `A1` o `A1:B2`. */
function rangeArea(ref: string): number {
  const parts = ref.split(':');
  if (parts.length > 2) throw tooComplex();
  const a = parseCellRef(parts[0]);
  const b = parts.length === 2 ? parseCellRef(parts[1]) : a;
  return (Math.abs(b.row - a.row) + 1) * (Math.abs(b.col - a.col) + 1);
}

function addRangeCells(budget: XlsxStructureBudget, area: number): void {
  budget.rangeCells += area;
  if (budget.rangeCells > XLSX_MAX_RANGE_CELLS) throw tooComplex();
}

// --- Hojas ---

// Filas y celdas en el orden del documento (grupo 1: nombre; grupo 2: atributos).
const ROW_OR_CELL_TAG = /<(?:[\w.-]+:)?(row|c)(?=[\s/>])((?:[^<>"']|"[^<"]*"|'[^<']*')*)>/gi;
const SHEET_TAG = tagRegex('sheet');
const COL_TAG = tagRegex('col');
const MERGE_TAG = tagRegex('mergeCell');
const VALIDATION_TAG = tagRegex('dataValidation');
const COMMENT_TAG = tagRegex('comment');
const POSITIVE_INT = /^[0-9]{1,7}$/;

/**
 * Suma a `budget.columns` la mayor columna que ExcelJS crea en esta hoja (H10). ExcelJS crea un
 * objeto Column por cada columna hasta la mayor de: `<col max>`, la columna de cada celda con `r`
 * (Row.getCellEx → Worksheet.getColumn) y el extremo derecho de cada combinación. Las celdas sin
 * `r` toman la columna siguiente a la anterior; no se siguen aquí porque cada una es una celda y
 * XLSX_MAX_CELLS ya las acota en todo el libro (como mucho 50 000 columnas de más en total).
 */
function addSheetColumns(budget: XlsxStructureBudget, maxColumn: number): void {
  budget.columns += maxColumn;
  if (budget.columns > XLSX_MAX_TOTAL_COLUMNS) throw tooComplex();
}

/**
 * Suma `width` al ancho de filas del libro. ExcelJS guarda las celdas de cada fila en
 * `_cells[columna - 1]` y después recorre el arreglo entero en `row.hasValues` (eachRow) y en
 * `row.eachCell`: una sola celda en XFD hace recorrer 16 384 posiciones por fila. Sin este tope, un
 * archivo de 27 KB con 4999 filas que solo tienen un espacio en XFD costaba más de 6 s de CPU.
 */
function addRowWidth(budget: XlsxStructureBudget, width: number): void {
  budget.rowWidth += width;
  if (budget.rowWidth > XLSX_MAX_ROW_WIDTH) throw tooComplex();
}

/** Columna del extremo derecho y filas de `A1` o `A1:B2` (ya validado por rangeArea). */
function rangeShape(ref: string): { rightColumn: number; rows: number } {
  const [a, b = a] = ref.split(':').map(parseCellRef);
  return { rightColumn: Math.max(a.col, b.col), rows: Math.abs(b.row - a.row) + 1 };
}

/**
 * Filas y celdas, en orden. El ancho de cada fila es una cota superior del largo de su arreglo de
 * celdas en ExcelJS: la mayor columna con `r` más el número de celdas sin `r` (cada una ocupa la
 * columna siguiente a la anterior). Si una "fila" que ExcelJS no ve (en CDATA, comentarios o con
 * otro prefijo) parte una fila real en dos, la suma de las partes sigue siendo una cota superior.
 * Devuelve la mayor columna con `r` de la hoja.
 */
function inspectRowsAndCells(text: string, budget: XlsxStructureBudget): number {
  let maxColumn = 0;
  let rowMax = 0;
  let rowWithoutRef = 0;
  const closeRow = () => {
    addRowWidth(budget, rowMax + rowWithoutRef);
    rowMax = 0;
    rowWithoutRef = 0;
  };
  for (const [, tag, attributes] of text.matchAll(ROW_OR_CELL_TAG)) {
    if (tag.toLowerCase() === 'row') {
      closeRow();
      budget.rows++;
      if (budget.rows > MAX_PHYSICAL_ROWS) throw tooManyLines();
      for (const r of attributeValues(attributes, 'r')) {
        if (!POSITIVE_INT.test(r)) throw tooComplex();
        if (Number(r) > MAX_PHYSICAL_ROWS) throw tooManyLines();
      }
      continue;
    }
    budget.cells++;
    if (budget.cells > XLSX_MAX_CELLS) throw tooComplex();
    const refs = attributeValues(attributes, 'r');
    if (refs.length === 0) rowWithoutRef++;
    for (const r of refs) {
      const ref = parseCellRef(r);
      if (ref.row > MAX_PHYSICAL_ROWS) throw tooManyLines();
      maxColumn = Math.max(maxColumn, ref.col);
      rowMax = Math.max(rowMax, ref.col);
    }
  }
  closeRow();
  return maxColumn;
}

function inspectWorksheet(text: string, budget: XlsxStructureBudget): void {
  let maxColumn = inspectRowsAndCells(text, budget);
  // ExcelJS crea un objeto por columna hasta el mayor `max` declarado.
  for (const [, attributes] of text.matchAll(COL_TAG)) {
    for (const name of ['min', 'max']) {
      for (const value of attributeValues(attributes, name)) {
        if (!POSITIVE_INT.test(value) || Number(value) < 1 || Number(value) > MAX_SHEET_COLUMN) {
          throw tooComplex();
        }
        maxColumn = Math.max(maxColumn, Number(value));
      }
    }
  }
  // Cada combinación crea sus celdas y se compara con todas las anteriores (coste cuadrático).
  for (const [, attributes] of text.matchAll(MERGE_TAG)) {
    budget.merges++;
    if (budget.merges > XLSX_MAX_MERGES) throw tooComplex();
    for (const ref of attributeValues(attributes, 'ref')) {
      addRangeCells(budget, rangeArea(ref));
      // Crea las celdas del rango: cada fila del rango llega hasta su columna derecha.
      const { rightColumn, rows } = rangeShape(ref);
      maxColumn = Math.max(maxColumn, rightColumn);
      addRowWidth(budget, rows * rightColumn);
    }
  }
  // Cada validación se copia a cada celda de su sqref (lista de rangos separados por espacios).
  for (const [, attributes] of text.matchAll(VALIDATION_TAG)) {
    for (const sqref of attributeValues(attributes, 'sqref')) {
      for (const ref of sqref.split(/\s+/).filter(Boolean)) addRangeCells(budget, rangeArea(ref));
    }
  }
  addSheetColumns(budget, maxColumn);
}

// --- Libro: nombres definidos ---

// Grupo 1: atributos; grupo 2: '/' si la etiqueta se cierra sola.
const DEFINED_NAME =
  /<(?:[\w.-]+:)?definedName(?=[\s/>])((?:[^<>"'/]|\/(?!>)|"[^<"]*"|'[^<']*')*)(\/?)>/gi;
const DEFINED_NAME_END = /<\/(?:[\w.-]+:)?definedName\s*>/gi;
// Un elemento de la lista: hoja opcional ('con comillas' o sin ellas) y una referencia: #REF!, una
// celda o rango (con o sin $), filas completas ($1:$2) o columnas completas ($A:$B).
const SHEET_PREFIX = String.raw`(?:(?:'(?:[^']|'')+'|[^'!,\s]+)!)?`;
const CELL = String.raw`\$?[A-Z]{1,3}\$?[0-9]{1,7}`;
const DEFINED_ITEM = new RegExp(
  String.raw`${SHEET_PREFIX}(#REF!|(${CELL})(?::(${CELL}))?|\$?[0-9]{1,7}:\$?[0-9]{1,7}|\$?[A-Z]{1,3}:\$?[A-Z]{1,3})`,
  'y',
);

/**
 * Contenido de un nombre definido: solo una lista de referencias separadas por comas (nada de
 * fórmulas ni constantes). ExcelJS expande cada rango con forma `$A$1:$B$2` celda a celda; las
 * filas o columnas completas no las expande. Para no depender de esa regla se cuentan todos los
 * rangos de celdas, con o sin $.
 */
function inspectDefinedName(content: string, budget: XlsxStructureBudget): void {
  if (content.includes('<')) throw tooComplex(); // CDATA, comentarios o elementos dentro
  const text = decodeXmlEntities(content).trim();
  if (text === '') return;
  let pos = 0;
  for (;;) {
    DEFINED_ITEM.lastIndex = pos;
    const match = DEFINED_ITEM.exec(text);
    if (!match) throw tooComplex();
    if (match[2]) addRangeCells(budget, rangeArea(match[3] ? `${match[2]}:${match[3]}` : match[2]));
    pos = DEFINED_ITEM.lastIndex;
    if (pos === text.length) return;
    if (text[pos] !== ',') throw tooComplex();
    pos++;
  }
}

// Número de hoja de 1 a 4 cifras: ExcelJS lo lee con parseInt, que acepta "12abc" o "1e9" como 12
// o 1; aquí solo se admiten cifras.
const SHEET_NUMBER = /^[0-9]{1,4}$/;

/** Número de hoja (sheetId o localSheetId) de cifras y ≤ XLSX_MAX_SHEET_ID; 400 si no. */
function sheetNumber(value: string): number {
  if (!SHEET_NUMBER.test(value) || Number(value) > XLSX_MAX_SHEET_ID) throw tooComplex();
  return Number(value);
}

/**
 * Hojas del libro (INFORME 7, H9). ExcelJS hace `_worksheets[sheetId] = hoja` y el getter
 * `workbook.worksheets` recorre el arreglo desde 0 hasta el mayor sheetId: con sheetId="4294967294"
 * son más de 10 minutos de CPU síncrona con un archivo de 1,4 KB. Cada <sheet> debe traer un único
 * sheetId de cifras, ≤ 1000 y sin repetirse (ExcelJS sobrescribiría la hoja); como mucho 50 hojas.
 */
function inspectSheets(text: string): void {
  const seen = new Set<number>();
  for (const [, attributes] of text.matchAll(SHEET_TAG)) {
    if (seen.size >= XLSX_MAX_SHEETS) throw tooComplex();
    const ids = attributeValues(attributes, 'sheetId');
    if (ids.length !== 1) throw tooComplex();
    const id = sheetNumber(ids[0]);
    if (seen.has(id)) throw tooComplex();
    seen.add(id);
  }
}

function inspectWorkbook(text: string, budget: XlsxStructureBudget): void {
  inspectSheets(text);
  for (const open of text.matchAll(DEFINED_NAME)) {
    // ExcelJS usa localSheetId como índice de sus hojas (áreas de impresión): mismo límite.
    for (const value of attributeValues(open[1], 'localSheetId')) sheetNumber(value);
    if (open[2] === '/') continue; // <definedName .../> sin contenido
    const contentStart = (open.index ?? 0) + open[0].length;
    DEFINED_NAME_END.lastIndex = contentStart;
    const close = DEFINED_NAME_END.exec(text);
    if (!close) throw tooComplex();
    inspectDefinedName(text.slice(contentStart, close.index), budget);
  }
}

/**
 * Revisa una parte que ExcelJS procesa (isExcelJsXmlPart), ya descomprimida: codificación y
 * declaraciones prohibidas (415) y, según la parte, los límites de estructura (400). Acumula los
 * contadores en `budget`. Las partes que ExcelJS no procesa se ignoran (H11).
 */
export function inspectXmlPart(name: string, data: Buffer, budget: XlsxStructureBudget): void {
  if (!isExcelJsXmlPart(name)) return;
  const text = decodeXmlPart(data);
  if (FORBIDDEN_DECL.test(text)) throw new UnsupportedMediaTypeException(IMPORT_MSG.xlsxDoctype);
  if (WORKSHEET_PART.test(name)) inspectWorksheet(text, budget);
  if (name.toLowerCase() === WORKBOOK_PART) inspectWorkbook(text, budget);
  if (COMMENTS_PART.test(name)) {
    // Cada comentario se cuelga de una celda: cuenta como celda.
    for (const _ of text.matchAll(COMMENT_TAG)) {
      budget.cells++;
      if (budget.cells > XLSX_MAX_CELLS) throw tooComplex();
    }
  }
}
