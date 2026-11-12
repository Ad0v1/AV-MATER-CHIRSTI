import ExcelJS from 'exceljs';
import { toCsvLine } from './csv-escape.js';
import { IMPORT_COLUMNS, OPTIONAL_CELLS } from './import-columns.js';
import {
  CSV_CONTENT_TYPE,
  MAX_ROWS,
  XLSX_CONTENT_TYPE,
  type ImportFormat,
  type ImportType,
} from './import.constants.js';

// Plantillas descargables (Decisión 2): la hoja "Datos" lleva solo encabezados, sin filas de
// ejemplo (el importador lee como datos todo lo que hay debajo de la fila 1). Lo explicativo y
// los ejemplos van en la hoja "Instrucciones" de la plantilla Excel.

export type ImportTemplate = { filename: string; contentType: string; body: Buffer };

/** Sección ya creada en el sistema (año activo): alimenta las listas desplegables de estudiantes. */
export type TemplateSection = { gradeLevel: number; code: string };
export type TemplateOptions = { sections?: TemplateSection[] };

/** Códigos de sección por grado, ordenados. */
function groupSections(sections: TemplateSection[]): Map<number, string[]> {
  const byGrade = new Map<number, string[]>();
  for (const s of [...sections].sort(
    (a, b) => a.gradeLevel - b.gradeLevel || a.code.localeCompare(b.code, 'es'),
  )) {
    const codes = byGrade.get(s.gradeLevel) ?? [];
    if (!codes.includes(s.code)) codes.push(s.code);
    byGrade.set(s.gradeLevel, codes);
  }
  return byGrade;
}

/** Filas que alcanza a ver la lista desplegable de secciones de un grado. */
const MAX_CODES_PER_GRADE = 100;

const UTF8_BOM = '﻿';

// Colores de la marca del colegio.
const COLOR = {
  brand: 'FF592719',
  brandSoft: 'FFF4EAE5',
  optional: 'FFFDE9B8',
  optionalText: 'FF6B3A06',
  info: 'FF2458A6',
  infoSoft: 'FFEBF2FF',
  ok: 'FF1F7A4D',
  okSoft: 'FFE3F4EA',
  line: 'FFD9CFC9',
  white: 'FFFFFFFF',
  text: 'FF2B2320',
} as const;

const TYPE_TITLE: Record<ImportType, string> = {
  students: 'estudiantes',
  teachers: 'docentes',
  guardians: 'apoderados',
};

type ColumnHelp = { name: string; help: string; example: string };

const COLUMN_HELP: Record<ImportType, ColumnHelp[]> = {
  students: [
    { name: 'dni', help: 'DNI del estudiante: 8 dígitos.', example: '70123456' },
    {
      name: 'nombre_completo',
      help: 'Nombres y apellidos del estudiante (3 a 120 caracteres).',
      example: 'Ana Lucía Pérez Ramos',
    },
    {
      name: 'grado',
      help: 'Elige el grado de la lista desplegable (los que tienen secciones creadas en el año activo).',
      example: '3',
    },
    {
      name: 'seccion',
      help: 'Elige la sección de la lista desplegable: muestra solo las del grado que escogiste.',
      example: 'A',
    },
    {
      name: 'dni_apoderado',
      help: 'DNI del apoderado. Todo estudiante tiene al menos uno. Si ya existe (por ejemplo, el de un hermano), se vincula sin crear otra cuenta.',
      example: '41234567',
    },
    {
      name: 'nombre_apoderado',
      help: 'Nombres y apellidos del apoderado. Solo hace falta si es nuevo.',
      example: 'Rosa Ramos Díaz',
    },
    {
      name: 'dni_apoderado_2',
      help: 'DNI del segundo apoderado. Un estudiante admite hasta 2; el primero es el principal.',
      example: '42345678',
    },
    {
      name: 'nombre_apoderado_2',
      help: 'Nombres y apellidos del segundo apoderado.',
      example: 'Luis Pérez Soto',
    },
  ],
  teachers: [
    { name: 'dni', help: 'DNI del docente: 8 dígitos.', example: '40123456' },
    {
      name: 'nombre_completo',
      help: 'Nombres y apellidos del docente (3 a 120 caracteres).',
      example: 'María Elena Quispe Huamán',
    },
  ],
  guardians: [
    {
      name: 'dni_apoderado',
      help: 'DNI del apoderado: 8 dígitos. Si ya existe, se reutiliza.',
      example: '41234567',
    },
    {
      name: 'nombre_apoderado',
      help: 'Nombres y apellidos del apoderado. Solo hace falta si es nuevo (igual en todas sus filas).',
      example: 'Rosa Ramos Díaz',
    },
    {
      name: 'dni_estudiante',
      help: 'DNI de un estudiante que ya existe en el aula virtual. Una fila por cada estudiante del apoderado (hasta 10).',
      example: '70123456',
    },
  ],
};

const TYPE_NOTES: Record<ImportType, string[]> = {
  students: [
    'Cada estudiante queda matriculado en la sección indicada del año académico activo.',
    'Al confirmar se descarga una hoja con el código y la contraseña inicial de cada cuenta nueva. Se muestra una sola vez.',
  ],
  teachers: [
    'Al confirmar se descarga una hoja con el código y la contraseña inicial de cada docente. Se muestra una sola vez.',
  ],
  guardians: ['Un estudiante admite hasta 2 apoderados.'],
};

const STEPS = [
  'Completa la hoja "Datos": una fila por registro, sin cambiar ni quitar los encabezados.',
  'Guarda el archivo como Excel (.xlsx) o CSV.',
  'Súbelo en la página de importación y revisa la vista previa.',
  'Si no hay errores, confírmalo. Nada se crea hasta que confirmas.',
];

const RULES = [
  'Escribe solo valores: no uses fórmulas, fechas ni casillas de verificación.',
  `Máximo ${MAX_ROWS} filas de datos y 500 caracteres por celda. El archivo no puede superar 1 MiB.`,
  'Los nombres no pueden empezar por = + - @.',
  'Los DNI van como texto: si empiezan con 0, la columna ya está preparada para conservarlo.',
];

export const templateFilename = (type: ImportType, format: ImportFormat): string =>
  `plantilla-${type}.${format}`;

/** Plantilla CSV: UTF-8 con BOM, separador ',' y solo la línea de encabezados. */
export function buildCsvTemplate(type: ImportType): ImportTemplate {
  const body = Buffer.from(`${UTF8_BOM}${toCsvLine(IMPORT_COLUMNS[type])}\r\n`, 'utf8');
  return { filename: templateFilename(type, 'csv'), contentType: CSV_CONTENT_TYPE, body };
}

/** Letra de columna de Excel (1 → A). */
function columnLetter(n: number): string {
  let out = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    out = String.fromCharCode(65 + ((x - 1) % 26)) + out;
  return out;
}

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const box = (argb: string): Partial<ExcelJS.Borders> => {
  const side = { style: 'thin' as const, color: { argb } };
  return { top: side, left: side, bottom: side, right: side };
};

/** Alto aproximado de una fila con texto que se ajusta (las celdas combinadas no se autoajustan). */
const heightFor = (text: string, charsPerLine: number): number =>
  Math.max(22, Math.ceil(text.length / charsPerLine) * 18 + 6);

/**
 * Plantilla XLSX. Hoja "Datos" (la primera, la que lee el importador): encabezados de color
 * (obligatorias en marrón, opcionales en ámbar), lista 1..5 en `grado` y aviso si un DNI no tiene
 * 8 dígitos. Hoja "Instrucciones": leyenda de colores, qué escribir en cada columna con un
 * ejemplo, los pasos y las reglas.
 */
export async function buildXlsxTemplate(
  type: ImportType,
  options: TemplateOptions = {},
): Promise<ImportTemplate> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aula virtual';
  const columns = IMPORT_COLUMNS[type];
  const byGrade =
    type === 'students' ? groupSections(options.sections ?? []) : new Map<number, string[]>();
  const grades = [...byGrade.keys()];
  const hasSections = grades.length > 0;
  const gradeAt = columns.indexOf('grado' as never) + 1;

  // --- Hoja "Datos" ---
  const data = workbook.addWorksheet('Datos', {
    properties: { tabColor: { argb: COLOR.brand } },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  data.columns = columns.map((name) => ({
    header: name,
    key: name,
    width: name.startsWith('dni') ? 18 : name.startsWith('nombre') ? 40 : 16,
  }));
  columns.forEach((name, index) => {
    // Los DNI son texto: Excel quita el cero inicial de un número.
    if (name.startsWith('dni')) data.getColumn(index + 1).numFmt = '@';
  });
  const header = data.getRow(1);
  header.height = 30;
  columns.forEach((name, index) => {
    const optional = OPTIONAL_CELLS.has(name);
    const cell = header.getCell(index + 1);
    cell.font = {
      bold: true,
      size: 11,
      color: { argb: optional ? COLOR.optionalText : COLOR.white },
    };
    cell.fill = solid(optional ? COLOR.optional : COLOR.brand);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = box(optional ? COLOR.optionalText : COLOR.brand);
  });

  columns.forEach((name, index) => {
    const letter = data.getColumn(index + 1).letter;
    if (name === 'grado') {
      const lastGrade = hasSections ? `$${columnLetter(grades.length)}$1` : '';
      for (let row = 2; row <= MAX_ROWS + 1; row++) {
        data.getCell(`${letter}${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [hasSections ? `Listas!$A$1:${lastGrade}` : '"1,2,3,4,5"'],
          showErrorMessage: true,
          errorStyle: hasSections ? 'warning' : 'stop',
          errorTitle: 'Grado no válido',
          error: hasSections
            ? 'Elige un grado de la lista (los que tienen secciones creadas).'
            : 'Elige un grado del 1 al 5',
        };
      }
    } else if (name === 'seccion' && hasSections && gradeAt > 0) {
      // Lista que depende del grado elegido en la misma fila: la columna de ese grado en "Listas".
      const gradeCol = columnLetter(gradeAt);
      const headers = `Listas!$A$1:$${columnLetter(grades.length)}$1`;
      for (let row = 2; row <= MAX_ROWS + 1; row++) {
        const col = `MATCH(VALUE($${gradeCol}${row}),${headers},0)-1`;
        const start = `OFFSET(Listas!$A$2,0,${col},${MAX_CODES_PER_GRADE},1)`;
        data.getCell(`${letter}${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`IFERROR(OFFSET(Listas!$A$2,0,${col},COUNTA(${start}),1),Listas!$Z$2)`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Sección no válida',
          error: 'Elige primero el grado y luego una sección de la lista.',
        };
      }
    } else if (name.startsWith('dni')) {
      for (let row = 2; row <= MAX_ROWS + 1; row++) {
        data.getCell(`${letter}${row}`).dataValidation = {
          type: 'textLength',
          operator: 'equal',
          allowBlank: true,
          formulae: [8],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'DNI no válido',
          error: 'El DNI tiene 8 dígitos.',
        };
      }
    }
  });

  // --- Hoja "Instrucciones" ---
  const help = workbook.addWorksheet('Instrucciones', {
    properties: { tabColor: { argb: COLOR.info } },
    views: [{ showGridLines: false }],
  });
  help.columns = [{ width: 24 }, { width: 16 }, { width: 64 }, { width: 26 }];
  const WIDE = 100; // caracteres por línea en B:D combinadas

  const title = help.addRow([`Plantilla de ${TYPE_TITLE[type]}`]);
  help.mergeCells(title.number, 1, title.number, 4);
  title.height = 38;
  title.getCell(1).font = { bold: true, size: 18, color: { argb: COLOR.white } };
  title.getCell(1).fill = solid(COLOR.brand);
  title.getCell(1).alignment = { vertical: 'middle', indent: 1 };

  const sub = help.addRow(['Lee esto una vez y llena la hoja "Datos". Son 4 pasos.']);
  help.mergeCells(sub.number, 1, sub.number, 4);
  sub.height = 26;
  sub.getCell(1).font = { italic: true, color: { argb: COLOR.text } };
  sub.getCell(1).fill = solid(COLOR.brandSoft);
  sub.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  help.addRow([]);

  const section = (text: string, color: string) => {
    const row = help.addRow([text]);
    help.mergeCells(row.number, 1, row.number, 4);
    row.height = 24;
    row.getCell(1).font = { bold: true, size: 13, color: { argb: color } };
    row.getCell(1).border = { bottom: { style: 'medium', color: { argb: color } } };
    row.getCell(1).alignment = { vertical: 'middle' };
  };

  // Leyenda de colores
  section('Colores de los encabezados en la hoja "Datos"', COLOR.brand);
  const required = help.addRow(['Obligatoria', '', 'La columna debe llenarse en cada fila.']);
  required.getCell(1).fill = solid(COLOR.brand);
  required.getCell(1).font = { bold: true, color: { argb: COLOR.white } };
  const optionalRow = help.addRow([
    'Opcional',
    '',
    'Puede quedar vacía (abajo se explica cuándo hace falta).',
  ]);
  optionalRow.getCell(1).fill = solid(COLOR.optional);
  optionalRow.getCell(1).font = { bold: true, color: { argb: COLOR.optionalText } };
  for (const row of [required, optionalRow]) {
    row.height = 24;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).alignment = { vertical: 'middle' };
  }
  help.addRow([]);

  // Qué escribir en cada columna
  section('Qué escribir en cada columna', COLOR.info);
  const tableHeader = help.addRow(['Columna', '¿Obligatoria?', 'Qué escribir', 'Ejemplo']);
  tableHeader.height = 24;
  tableHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.white } };
    cell.fill = solid(COLOR.info);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  COLUMN_HELP[type].forEach((col, i) => {
    const optional = OPTIONAL_CELLS.has(col.name);
    const row = help.addRow([col.name, optional ? 'Opcional' : 'Sí', col.help, col.example]);
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = box(COLOR.line);
      if (i % 2 === 1) cell.fill = solid(COLOR.infoSoft);
    });
    row.getCell(1).font = { bold: true, color: { argb: COLOR.brand } };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).font = { bold: true, color: { argb: optional ? COLOR.optionalText : COLOR.ok } };
    row.getCell(4).numFmt = '@';
    row.height = heightFor(col.help, 60);
  });
  help.addRow([]);

  // Pasos y reglas
  const list = (lines: string[], numbered: boolean, color: string, soft: string) => {
    lines.forEach((line, i) => {
      const row = help.addRow([numbered ? `Paso ${i + 1}` : '•', line]);
      help.mergeCells(row.number, 2, row.number, 4);
      row.height = heightFor(line, WIDE);
      row.getCell(1).font = { bold: true, color: { argb: color } };
      row.getCell(1).fill = solid(soft);
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    });
  };
  section('Antes de subir el archivo', COLOR.ok);
  list(STEPS, true, COLOR.ok, COLOR.okSoft);
  help.addRow([]);
  section('Reglas importantes', COLOR.optionalText);
  list([...TYPE_NOTES[type], ...RULES], false, COLOR.optionalText, COLOR.optional);

  // --- Hoja "Listas": las secciones que ya existen en el sistema (año activo) ---
  if (hasSections) {
    const lists = workbook.addWorksheet('Listas', {
      properties: { tabColor: { argb: COLOR.ok } },
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    grades.forEach((grade, i) => {
      const col = lists.getColumn(i + 1);
      col.width = 14;
      const head = lists.getCell(1, i + 1);
      head.value = grade; // número: la lista de secciones lo busca con MATCH
      head.numFmt = '"Grado "0';
      head.font = { bold: true, color: { argb: COLOR.white } };
      head.fill = solid(COLOR.ok);
      head.alignment = { horizontal: 'center', vertical: 'middle' };
      head.border = box(COLOR.ok);
      (byGrade.get(grade) ?? []).forEach((code, j) => {
        const cell = lists.getCell(j + 2, i + 1);
        cell.value = code;
        cell.numFmt = '@';
        cell.alignment = { horizontal: 'center' };
        cell.border = box(COLOR.line);
        if (j % 2 === 1) cell.fill = solid(COLOR.okSoft);
      });
    });
    lists.getRow(1).height = 26;
    const note = lists.getCell(1, grades.length + 2);
    note.value = 'Secciones del año activo. Esta hoja se genera al descargar la plantilla.';
    note.font = { italic: true, color: { argb: COLOR.text } };
  }

  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: templateFilename(type, 'xlsx'), contentType: XLSX_CONTENT_TYPE, body };
}

export function buildTemplate(
  type: ImportType,
  format: ImportFormat,
  options: TemplateOptions = {},
): Promise<ImportTemplate> {
  return format === 'csv'
    ? Promise.resolve(buildCsvTemplate(type))
    : buildXlsxTemplate(type, options);
}
