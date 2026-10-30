import ExcelJS from 'exceljs';
import { parseCsv } from './csv-parser.js';
import { IMPORT_COLUMNS, mapHeaders } from './import-columns.js';
import { IMPORT_TYPES } from './import.constants.js';
import { buildTemplate } from './import-template.js';
import { readXlsx } from './xlsx-reader.js';

describe('plantillas (Decisión 2)', () => {
  it.each(IMPORT_TYPES)('CSV %s: UTF-8 con BOM, coma y solo encabezados', async (type) => {
    const t = await buildTemplate(type, 'csv');
    expect(t.filename).toBe(`plantilla-${type}.csv`);
    expect(t.contentType).toBe('text/csv; charset=utf-8');
    expect([...t.body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(t.body.toString('utf8')).toBe(`\uFEFF${IMPORT_COLUMNS[type].join(',')}\r\n`);
    const rows = parseCsv(t.body);
    expect(rows).toHaveLength(1);
    expect(() => mapHeaders(type, rows[0].cells)).not.toThrow();
  });

  it.each(IMPORT_TYPES)(
    'XLSX %s: hoja Datos en negrita, sin filas de ejemplo, e Instrucciones',
    async (type) => {
      const t = await buildTemplate(type, 'xlsx');
      expect(t.filename).toBe(`plantilla-${type}.xlsx`);
      expect(t.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const rows = await readXlsx(t.body);
      expect(rows).toEqual([{ row: 1, cells: [...IMPORT_COLUMNS[type]] }]);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(t.body as unknown as Parameters<typeof wb.xlsx.load>[0]);
      expect(wb.worksheets.map((s) => s.name)).toEqual(['Datos', 'Instrucciones']);
      const data = wb.getWorksheet('Datos')!;
      expect(data.getRow(1).font?.bold ?? data.getCell('A1').font?.bold).toBe(true);
      expect(wb.getWorksheet('Instrucciones')!.rowCount).toBeGreaterThan(3);

      const gradeIndex = (IMPORT_COLUMNS[type] as readonly string[]).indexOf('grado');
      if (gradeIndex >= 0) {
        const validation = data.getCell(2, gradeIndex + 1).dataValidation;
        expect(validation).toMatchObject({ type: 'list', formulae: ['"1,2,3,4,5"'] });
      }
    },
  );
});
