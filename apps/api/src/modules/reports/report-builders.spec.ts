import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSectionHtml } from './report-html.js';
import { htmlText, spreadsheetText } from './report-text.js';
import { buildSectionXlsx, XLSX_SHEET, XLSX_TABLE_ROW } from './report-xlsx.js';
import { cellValue, type SectionReportData } from './section-report.js';

// RF-58: constructores XLSX y HTML del registro y sus escapes (D-035, U4).

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function sample(overrides: Partial<SectionReportData> = {}): SectionReportData {
  return {
    institution: { name: 'I.E. <Mater> Christi', logo: { mime: 'image/png', data: PNG_1X1 } },
    year: 2026,
    course: '=HYPERLINK("http://x")',
    teacher: '+Docente Uno',
    level: 'SECUNDARIA',
    gradingScale: 'NUMERIC_0_20',
    gradeLevel: 3,
    sectionCode: 'A',
    period: 'Bimestre 1',
    generatedAt: new Date('2026-05-10T15:00:00Z'),
    riskLiteral: 'C',
    assignments: [{ title: '@Tarea <b>1</b>' }, { title: 'Tarea 2' }],
    students: [
      {
        fullName: '-Ana <script>alert(1)</script>',
        isCurrent: true,
        cells: [
          { state: 'GRADED', value: '15.50', isLate: false },
          { state: 'NE', value: '0.00', isLate: false },
        ],
        average: { status: 'OK', rounded: 8, literal: 'C', counted: 2, exempt: 0 },
        atRisk: true,
      },
      {
        fullName: 'Beto',
        isCurrent: false,
        cells: [
          { state: 'EXEMPT', value: null, isLate: false },
          { state: null, value: null, isLate: false },
        ],
        average: { status: 'NO_GRADES', counted: 0, exempt: 1 },
        atRisk: false,
      },
    ],
    ...overrides,
  };
}

describe('escapes', () => {
  it('spreadsheetText antepone apóstrofo a = + - @ TAB CR y quita controles', () => {
    expect(spreadsheetText('=1+1')).toBe("'=1+1");
    expect(spreadsheetText('+51')).toBe("'+51");
    expect(spreadsheetText('-x')).toBe("'-x");
    expect(spreadsheetText('@a')).toBe("'@a");
    expect(spreadsheetText('\tx')).toBe("'\tx");
    expect(spreadsheetText('Ana')).toBe('Ana');
    expect(spreadsheetText('a\u0000b\u0007')).toBe('ab');
    expect(spreadsheetText('\u0001=x')).toBe("'=x");
  });

  it('htmlText escapa los caracteres de HTML y atributos', () => {
    expect(htmlText(`<a href="x" onclick='y'>&\``)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;',
    );
  });

  it('cellValue: número, NE, EXO y vacío', () => {
    expect(cellValue({ state: 'GRADED', value: '15.50', isLate: false })).toBe(15.5);
    expect(cellValue({ state: 'NE', value: '0.00', isLate: false })).toBe('NE 0.00');
    expect(cellValue({ state: 'EXEMPT', value: null, isLate: false })).toBe('EXO');
    expect(cellValue({ state: null, value: null, isLate: false })).toBe('');
  });
});

describe('buildSectionXlsx', () => {
  async function load(data: SectionReportData) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSectionXlsx(data)) as unknown as ExcelJS.Buffer);
    return wb;
  }

  it('genera un XLSX que exceljs abre, con cabecera, tabla y textos escapados', async () => {
    const wb = await load(sample());
    const ws = wb.getWorksheet(XLSX_SHEET)!;
    expect(ws).toBeDefined();
    expect(ws.getCell('B1').value).toBe('I.E. <Mater> Christi');
    expect(ws.getCell('B2').value).toBe('Curso: =HYPERLINK("http://x")');
    expect(ws.getCell('B3').value).toBe('Docente: +Docente Uno');
    expect(ws.getCell('B4').value).toBe('Sección: 3.° Secundaria A (2026)');
    expect(ws.getCell('B5').value).toBe('Período: Bimestre 1');

    const header = ws.getRow(XLSX_TABLE_ROW);
    expect(header.getCell(3).value).toBe("'@Tarea <b>1</b>");
    expect(header.getCell(5).value).toBe('Promedio');

    const r1 = ws.getRow(XLSX_TABLE_ROW + 1);
    expect(r1.getCell(1).value).toBe(1);
    expect(r1.getCell(2).value).toBe("'-Ana <script>alert(1)</script>");
    expect(r1.getCell(3).value).toBe(15.5);
    expect(r1.getCell(4).value).toBe('NE 0.00');
    expect(r1.getCell(5).value).toBe(8);
    expect(r1.getCell(6).value).toBe('C');
    expect(r1.getCell(7).value).toBe('Sí');

    const r2 = ws.getRow(XLSX_TABLE_ROW + 2);
    expect(r2.getCell(2).value).toBe('Beto (retirado)');
    expect(r2.getCell(3).value).toBe('EXO');
    expect(r2.getCell(5).value).toBeNull();
    expect(r2.getCell(6).value).toBe('Sin notas');

    // Ninguna celda es fórmula.
    ws.eachRow((row) =>
      row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)),
    );
    expect(wb.model.media?.length ?? 0).toBe(1);
  });

  it('sin logo no embebe imágenes; sin docente lo dice', async () => {
    const wb = await load(
      sample({ institution: { name: 'IE', logo: null }, teacher: null, students: [] }),
    );
    const ws = wb.getWorksheet(XLSX_SHEET)!;
    expect(ws.getCell('B3').value).toBe('Docente: Sin docente asignado');
    expect(wb.model.media?.length ?? 0).toBe(0);
  });
});

describe('buildSectionHtml', () => {
  it('escapa todo el texto y no trae scripts ni recursos externos', () => {
    const html = buildSectionHtml(sample());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/(src|href)="(https?:|\/\/)/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('I.E. &lt;Mater&gt; Christi');
    expect(html).toContain('=HYPERLINK(&quot;http://x&quot;)');
    expect(html).toContain('@Tarea &lt;b&gt;1&lt;/b&gt;');
    expect(html).toContain("default-src 'none'; img-src data:");
    expect(html).toContain(`src="data:image/png;base64,${PNG_1X1.toString('base64')}"`);
    expect(html).toContain('<tr class="risk">');
    expect(html).toContain('Beto (retirado)');
  });

  it('no embebe un logo con MIME fuera de la lista', () => {
    const html = buildSectionHtml(
      sample({
        institution: {
          name: 'IE',
          logo: { mime: 'image/svg+xml' as 'image/png', data: Buffer.from('<svg/>') },
        },
      }),
    );
    expect(html).not.toContain('<img');
  });

  it('sin estudiantes muestra una fila vacía', () => {
    expect(buildSectionHtml(sample({ students: [] }))).toContain('Sin estudiantes.');
  });
});
