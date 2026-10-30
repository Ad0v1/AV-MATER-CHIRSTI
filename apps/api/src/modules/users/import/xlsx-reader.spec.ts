import { BadRequestException, Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { EXTRA_CELLS_MARKER } from './import.constants.js';
import { readXlsx } from './xlsx-reader.js';
import { buildZip, inlineCell, minimalParts, rawXlsx } from './zip-builder.mock-spec.js';

const FORMULA = { problem: 'FORMULA_NOT_ALLOWED' };
const INVALID = { problem: 'INVALID_CELL' };

async function workbook(fill: (sheet: ExcelJS.Worksheet, wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Datos');
  fill(sheet, wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('readXlsx (Decisión 1)', () => {
  it('convierte cada tipo de celda: texto, richText, hipervínculo y enteros', async () => {
    const buf = await workbook((s) => {
      s.addRow(['correo', 'nombre_completo', 'grado', 'seccion']);
      s.getCell('A2').value = {
        richText: [{ text: 'ana' }, { font: { bold: true }, text: '@colegio.example' }],
      };
      s.getCell('B2').value = { text: 'Ana Pérez', hyperlink: 'https://example.com' };
      s.getCell('C2').value = 3;
      s.getCell('D2').value = ' a ';
    });
    const rows = await readXlsx(buf);
    expect(rows).toEqual([
      { row: 1, cells: ['correo', 'nombre_completo', 'grado', 'seccion'] },
      { row: 2, cells: ['ana@colegio.example', 'Ana Pérez', '3', ' a '] },
    ]);
  });

  it('fórmula → FORMULA_NOT_ALLOWED; fecha, booleano, error y decimal → INVALID_CELL', async () => {
    const buf = await workbook((s) => {
      s.addRow(['a', 'b', 'c', 'd', 'e', 'f']);
      s.getCell('A2').value = { formula: 'HYPERLINK("http://x","y")', result: 'y' };
      s.getCell('B2').value = new Date(Date.UTC(2026, 0, 1));
      s.getCell('C2').value = true;
      s.getCell('D2').value = { error: '#N/A' };
      s.getCell('E2').value = 2.5;
      s.getCell('A3').value = { formula: '1+1', result: 2 };
      s.getCell('B3').value = { sharedFormula: 'A3', result: 2 };
    });
    const rows = await readXlsx(buf);
    expect(rows[1].cells).toEqual([FORMULA, INVALID, INVALID, INVALID, INVALID]);
    expect(rows[2].cells).toEqual([FORMULA, FORMULA]);
  });

  it('solo lee la primera hoja y conserva el número de fila físico', async () => {
    const buf = await workbook((s, wb) => {
      s.getCell('A1').value = 'correo';
      s.getCell('A5').value = 'x@colegio.example';
      wb.addWorksheet('Otra').addRow(['no se lee']);
    });
    const rows = await readXlsx(buf);
    expect(rows).toEqual([
      { row: 1, cells: ['correo'] },
      { row: 5, cells: ['x@colegio.example'] },
    ]);
  });

  it('más filas de datos que el máximo → 400', async () => {
    const buf = await workbook((s) => {
      s.addRow(['correo']);
      for (let i = 0; i < 4; i++) s.addRow([`u${i}@colegio.example`]);
    });
    await expect(readXlsx(buf, 4)).resolves.toHaveLength(5);
    await expect(readXlsx(buf, 3)).rejects.toThrow(BadRequestException);
  });

  it('ZIP válido que no es un Excel → 400 con mensaje fijo y al log solo el nombre del error', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const zip = buildZip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
      { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="Ana Pérez ana@colegio' },
    ]);
    await expect(readXlsx(zip)).rejects.toThrow('El archivo está dañado o no es un Excel válido');
    // Sin hojas: también 400.
    await expect(readXlsx(buildZip([{ name: 'hola.txt', data: 'x' }]))).rejects.toThrow(
      BadRequestException,
    );
    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toMatch(/Ana|colegio|sheet/);
    }
    warn.mockRestore();
  });

  it('pasa por el guard antes de ExcelJS (macros → 415)', async () => {
    const zip = buildZip([...minimalParts(), { name: 'xl/vbaProject.bin', data: 'x' }]);
    await expect(readXlsx(zip)).rejects.toThrow(UnsupportedMediaTypeException);
  });

  describe('H2: archivos hostiles terminan rápido con 400 y sin crear celdas de más', () => {
    const timed = async (buf: Buffer) => {
      const started = performance.now();
      const result = await readXlsx(buf).then(
        () => 'ok' as const,
        (error: unknown) => (error instanceof BadRequestException ? 400 : error),
      );
      return { result, ms: performance.now() - started };
    };

    it('100 000 filas y una celda en XFD → 400 en menos de 2 s', async () => {
      const rows = Array.from({ length: 100_000 }, (_, i) => `<row r="${i + 1}"/>`).join('');
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}${inlineCell('XFD1', 'x')}</row>${rows}</sheetData>`,
      );
      expect(buf.length).toBeLessThan(1_048_576);
      const { result, ms } = await timed(buf);
      expect(result).toBe(400);
      expect(ms).toBeLessThan(2000);
    });

    it('una combinación sobre A1:XFD5000 (1,5 KB que agotaba la memoria de ExcelJS) → 400 rápido', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'x')}</row></sheetData><mergeCells><mergeCell ref="A1:XFD5000"/></mergeCells>`,
      );
      const { result, ms } = await timed(buf);
      expect(result).toBe(400);
      expect(ms).toBeLessThan(2000);
    });

    it('un nombre definido sobre toda la hoja → 400 rápido', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'x')}</row></sheetData>`,
        '<definedNames><definedName name="x">Datos!$A$1:$XFD$1048576</definedName></definedNames>',
      );
      const { result, ms } = await timed(buf);
      expect(result).toBe(400);
      expect(ms).toBeLessThan(2000);
    });

    it('una celda en XFD: lee 30 columnas y marca el dato de más (EXTRA_CELLS) sin recorrer 16 384', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row><row r="2">${inlineCell('A2', 'a@colegio.example')}${inlineCell('XFD2', 'x')}</row><row r="3">${inlineCell('A3', 'b@colegio.example')}<c r="XFD3"/></row></sheetData>`,
      );
      const rows = await readXlsx(buf);
      expect(rows[0]).toEqual({ row: 1, cells: ['correo'] });
      expect(rows[1].cells).toHaveLength(31);
      expect(rows[1].cells[0]).toBe('a@colegio.example');
      expect(rows[1].cells[30]).toBe(EXTRA_CELLS_MARKER);
      // Una celda vacía lejos no es un dato.
      expect(rows[2].cells).toEqual(['b@colegio.example']);
    });

    it('H9: sheetId="4294967294" (1,4 KB que dejaba a ExcelJS más de 10 min sin responder) → 400 en < 1 s', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row></sheetData>`,
        '',
        '<sheet name="Datos" sheetId="4294967294" r:id="rId1"/>',
      );
      expect(buf.length).toBeLessThan(2048);
      const { result, ms } = await timed(buf);
      expect(result).toBe(400);
      expect(ms).toBeLessThan(1000);
    });

    it('H9: con sheetId válido (≤ 1000) el mismo libro se lee', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row></sheetData>`,
        '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Datos!$A$1:$A$2</definedName></definedNames>',
        '<sheet name="Datos" sheetId="1000" r:id="rId1"/>',
      );
      expect(await readXlsx(buf)).toEqual([{ row: 1, cells: ['correo'] }]);
    });

    it('4999 filas con un espacio en XFD (27 KB y más de 6 s de CPU en ExcelJS) → 400 en < 1 s', async () => {
      const blank = Array.from(
        { length: 4999 },
        (_, i) => `<row r="${i + 2}">${inlineCell(`XFD${i + 2}`, ' ')}</row>`,
      ).join('');
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row>${blank}</sheetData>`,
      );
      expect(buf.length).toBeLessThan(32 * 1024);
      const { result, ms } = await timed(buf);
      expect(result).toBe(400);
      expect(ms).toBeLessThan(1000);
    });

    it('H10: 4 hojas con una celda en XFD → 400 rápido', async () => {
      const far = `<sheetData><row r="1">${inlineCell('A1', 'correo')}${inlineCell('XFD1', 'x')}</row></sheetData>`;
      const extra = [2, 3, 4].map((n) => ({
        name: `xl/worksheets/sheet${n}.xml`,
        data: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${far}</worksheet>`,
      }));
      const { result, ms } = await timed(rawXlsx(far, '', undefined, extra));
      expect(result).toBe(400);
      expect(ms).toBeLessThan(1000);
    });

    it('H11: un customXml/item1.xml en UTF-16 (SharePoint/OneDrive) no impide leer el libro', async () => {
      const utf16 = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(
          '<?xml version="1.0" encoding="UTF-16" standalone="no"?><ds:datastoreItem ds:itemID="{X}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>',
          'utf16le',
        ),
      ]);
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row></sheetData>`,
        '',
        undefined,
        [{ name: 'customXml/item1.xml', data: utf16 }],
      );
      expect(await readXlsx(buf)).toEqual([{ row: 1, cells: ['correo'] }]);
    });

    it('H11: una hoja en UTF-16 sigue dando 415', async () => {
      const sheet = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(
          '<?xml version="1.0" encoding="UTF-16"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
          'utf16le',
        ),
      ]);
      const buf = rawXlsx('<sheetData/>', '', undefined, [
        { name: 'xl/worksheets/sheet2.xml', data: sheet },
      ]);
      await expect(readXlsx(buf)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('las filas vacías no se devuelven (solo cuenta su número físico)', async () => {
      const buf = rawXlsx(
        `<sheetData><row r="1">${inlineCell('A1', 'correo')}</row><row r="2"><c r="A2" t="inlineStr"><is><t>  </t></is></c></row><row r="3">${inlineCell('A3', 'x')}</row></sheetData>`,
      );
      expect((await readXlsx(buf)).map((r) => r.row)).toEqual([1, 3]);
    });
  });
});
