import ExcelJS from 'exceljs';
import { spreadsheetText } from './report-text.js';
import {
  achievementText,
  averageLiteral,
  averageValue,
  cellValue,
  isLiteralReport,
  legendText,
  limaTimestamp,
  sectionText,
  type SectionReportData,
} from './section-report.js';

// Registro de un curso-sección y período en Excel (RF-58) con exceljs 4.4.0 (D-035). Todo texto
// pasa por spreadsheetText (sin fórmulas); los números van como número. El logo se embebe como
// imagen (PNG o JPEG ya validados al subirlo, U5).

/** Fila donde empieza la tabla (después de la cabecera institucional). */
export const XLSX_TABLE_ROW = 8;
export const XLSX_SHEET = 'Registro';

const t = spreadsheetText;

export async function buildSectionXlsx(data: SectionReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = t(data.institution.name);
  workbook.created = data.generatedAt;
  const ws = workbook.addWorksheet(XLSX_SHEET, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', xSplit: 2, ySplit: XLSX_TABLE_ROW }],
  });

  const literal = isLiteralReport(data);
  const summaryCols = literal ? ['Logro', 'En riesgo'] : ['Promedio', 'Literal', 'En riesgo'];
  const headerCols = ['N.º', 'Estudiante', ...data.assignments.map((a) => a.title), ...summaryCols];
  ws.columns = headerCols.map((_, i) => ({
    width: i === 0 ? 10 : i === 1 ? 38 : i < headerCols.length - summaryCols.length ? 14 : 11,
  }));

  if (data.institution.logo) {
    const id = workbook.addImage({
      buffer: data.institution.logo.data as unknown as ExcelJS.Buffer,
      extension: data.institution.logo.mime === 'image/png' ? 'png' : 'jpeg',
    });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 64, height: 64 } });
  }

  const meta: [string, string][] = [
    ['', data.institution.name],
    ['Curso', data.course],
    ['Docente', data.teacher ?? 'Sin docente asignado'],
    ['Sección', `${sectionText(data.level, data.gradeLevel, data.sectionCode)} (${data.year})`],
    ['Período', data.period],
    ['Generado', limaTimestamp(data.generatedAt)],
  ];
  meta.forEach(([label, value], i) => {
    const row = ws.getRow(i + 1);
    row.getCell(2).value = label ? t(`${label}: ${value}`) : t(value);
    if (i === 0) row.getCell(2).font = { bold: true, size: 14 };
  });

  const header = ws.getRow(XLSX_TABLE_ROW);
  headerCols.forEach((title, i) => {
    const cell = header.getCell(i + 1);
    cell.value = t(title);
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });

  data.students.forEach((s, i) => {
    const row = ws.getRow(XLSX_TABLE_ROW + 1 + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = t(s.isCurrent ? s.fullName : `${s.fullName} (retirado)`);
    s.cells.forEach((c, j) => {
      const v = cellValue(c);
      row.getCell(3 + j).value = typeof v === 'number' ? v : t(v);
    });
    const base = 3 + data.assignments.length;
    if (literal) {
      row.getCell(base).value = t(achievementText(s.achievement));
      row.getCell(base + 1).value = s.atRisk ? 'Sí' : 'No';
    } else {
      row.getCell(base).value = averageValue(s.average);
      row.getCell(base + 1).value = t(averageLiteral(s.average));
      row.getCell(base + 2).value = s.atRisk ? 'Sí' : 'No';
    }
  });

  const legendRow = XLSX_TABLE_ROW + data.students.length + 2;
  ws.getRow(legendRow).getCell(2).value = t(legendText(data));

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
