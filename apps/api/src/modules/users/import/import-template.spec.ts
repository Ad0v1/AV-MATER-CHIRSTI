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

describe('plantilla de estudiantes con secciones del sistema', () => {
  const sections = [
    { gradeLevel: 2, code: 'B' },
    { gradeLevel: 1, code: 'A' },
    { gradeLevel: 1, code: 'B' },
    { gradeLevel: 2, code: 'A' },
    { gradeLevel: 2, code: 'A' },
  ];

  it('agrega la hoja Listas, listas desplegables de grado y sección, y se sigue leyendo bien', async () => {
    const t = await buildTemplate('students', 'xlsx', { sections });
    expect(t.body.length).toBeLessThan(1024 * 1024);

    // El importador sigue viendo solo los encabezados de la hoja Datos.
    const rows = await readXlsx(t.body);
    expect(rows).toEqual([{ row: 1, cells: [...IMPORT_COLUMNS.students] }]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(t.body as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Datos', 'Instrucciones', 'Listas']);

    const lists = wb.getWorksheet('Listas')!;
    expect(lists.getCell('A1').value).toBe(1);
    expect(lists.getCell('B1').value).toBe(2);
    expect([lists.getCell('A2').value, lists.getCell('A3').value]).toEqual(['A', 'B']);
    expect([lists.getCell('B2').value, lists.getCell('B3').value]).toEqual(['A', 'B']);
    expect(lists.getCell('B4').value).toBeNull(); // sección repetida: una sola vez

    const data = wb.getWorksheet('Datos')!;
    const grade = IMPORT_COLUMNS.students.indexOf('grado') + 1;
    const section = IMPORT_COLUMNS.students.indexOf('seccion') + 1;
    expect(data.getCell(2, grade).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['Listas!$A$1:$B$1'],
    });
    const f = data.getCell(5, section).dataValidation.formulae?.[0] as string;
    expect(f).toContain('OFFSET(Listas!$A$2');
    expect(f).toContain('$C5'); // depende del grado de su propia fila
  });

  it('sin secciones, la plantilla sigue como antes (grado 1 a 5, sección libre)', async () => {
    const t = await buildTemplate('students', 'xlsx', { sections: [] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(t.body as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Datos', 'Instrucciones']);
    const grade = IMPORT_COLUMNS.students.indexOf('grado') + 1;
    expect(wb.getWorksheet('Datos')!.getCell(2, grade).dataValidation).toMatchObject({
      formulae: ['"1,2,3,4,5"'],
    });
  });
});
