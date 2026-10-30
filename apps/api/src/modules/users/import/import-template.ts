import ExcelJS from 'exceljs';
import { toCsvLine } from './csv-escape.js';
import { IMPORT_COLUMNS } from './import-columns.js';
import {
  CSV_CONTENT_TYPE,
  MAX_ROWS,
  XLSX_CONTENT_TYPE,
  type ImportFormat,
  type ImportType,
} from './import.constants.js';

// Plantillas descargables (Decisión 2): solo encabezados, sin filas de ejemplo.

export type ImportTemplate = { filename: string; contentType: string; body: Buffer };

const UTF8_BOM = '\uFEFF';

const COMMON_INSTRUCTIONS = [
  'Completa una fila por registro en la hoja "Datos". No cambies ni quites los encabezados.',
  'Escribe solo valores: no uses fórmulas, fechas ni casillas de verificación.',
  `Máximo ${MAX_ROWS} filas de datos y 500 caracteres por celda. El archivo no puede superar 1 MiB.`,
  'Los nombres no pueden empezar por = + - @.',
  'Primero sube el archivo para la vista previa; si no hay errores, confírmalo.',
];

const INSTRUCTIONS: Record<ImportType, string[]> = {
  students: [
    'correo: correo institucional del estudiante.',
    'nombre_completo: nombres y apellidos (3 a 120 caracteres).',
    'grado: número del 1 al 5.',
    'seccion: código de la sección del año activo (1 a 8 letras o dígitos, p. ej. A).',
    'Cada estudiante queda matriculado en la sección indicada del año académico activo.',
  ],
  teachers: [
    'correo: correo institucional del docente.',
    'nombre_completo: nombres y apellidos (3 a 120 caracteres).',
  ],
  guardians: [
    'correo_apoderado: correo del apoderado.',
    'nombre_apoderado: nombres y apellidos del apoderado (igual en todas sus filas).',
    'correo_estudiante: correo de un estudiante que ya existe en el aula virtual.',
    'Una fila por cada estudiante del apoderado (hasta 10).',
  ],
};

export const templateFilename = (type: ImportType, format: ImportFormat): string =>
  `plantilla-${type}.${format}`;

/** Plantilla CSV: UTF-8 con BOM, separador ',' y solo la línea de encabezados. */
export function buildCsvTemplate(type: ImportType): ImportTemplate {
  const body = Buffer.from(`${UTF8_BOM}${toCsvLine(IMPORT_COLUMNS[type])}\r\n`, 'utf8');
  return { filename: templateFilename(type, 'csv'), contentType: CSV_CONTENT_TYPE, body };
}

/**
 * Plantilla XLSX: hoja "Datos" con encabezados en negrita (y lista 1..5 en `grado`) y hoja
 * "Instrucciones".
 */
export async function buildXlsxTemplate(type: ImportType): Promise<ImportTemplate> {
  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet('Datos');
  const columns = IMPORT_COLUMNS[type];
  data.columns = columns.map((name) => ({ header: name, key: name, width: 32 }));
  data.getRow(1).font = { bold: true };
  data.views = [{ state: 'frozen', ySplit: 1 }];

  const gradeIndex = (columns as readonly string[]).indexOf('grado');
  if (gradeIndex >= 0) {
    const column = data.getColumn(gradeIndex + 1).letter;
    for (let row = 2; row <= MAX_ROWS + 1; row++) {
      data.getCell(`${column}${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"1,2,3,4,5"'],
        showErrorMessage: true,
        errorTitle: 'Grado no válido',
        error: 'Elige un grado del 1 al 5',
      };
    }
  }

  const help = workbook.addWorksheet('Instrucciones');
  help.getColumn(1).width = 110;
  for (const line of [...INSTRUCTIONS[type], ...COMMON_INSTRUCTIONS]) help.addRow([line]);

  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: templateFilename(type, 'xlsx'), contentType: XLSX_CONTENT_TYPE, body };
}

export function buildTemplate(type: ImportType, format: ImportFormat): Promise<ImportTemplate> {
  return format === 'csv' ? Promise.resolve(buildCsvTemplate(type)) : buildXlsxTemplate(type);
}
