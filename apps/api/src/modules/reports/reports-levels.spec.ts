import { buildGradebook, DEFAULT_LITERAL_SCALE, type GradeLiteralCode } from '@aula/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { aggregateDashboard, type DashboardInput } from './dashboard-aggregate.js';
import { buildSectionHtml } from './report-html.js';
import { buildSectionXlsx, XLSX_SHEET, XLSX_TABLE_ROW } from './report-xlsx.js';
import { courseSectionsQuerySchema, dashboardQuerySchema } from './reports.dto.js';
import { cellValue, reportBaseName, type SectionReportData } from './section-report.js';

// Tres niveles (09/11/2026): filtros por (nivel, grado), reportes en escala literal con logro del
// bimestre y dashboard que separa promedios (numérica) de logros (literal).

const YEAR = '11111111-1111-4111-8111-111111111111';
const PERIOD = '22222222-2222-4222-8222-222222222222';

describe('DTO: nivel y grado', () => {
  it('acepta el grado dentro del nivel', () => {
    expect(courseSectionsQuerySchema.parse({ level: 'INICIAL', gradeLevel: '5' })).toMatchObject({
      level: 'INICIAL',
      gradeLevel: 5,
    });
    expect(
      dashboardQuerySchema.safeParse({
        academicYearId: YEAR,
        periodId: PERIOD,
        level: 'PRIMARIA',
        gradeLevel: '6',
      }).success,
    ).toBe(true);
    expect(courseSectionsQuerySchema.safeParse({ level: 'PRIMARIA' }).success).toBe(true);
  });

  it.each([
    [{ level: 'SECUNDARIA', gradeLevel: '6' }],
    [{ level: 'INICIAL', gradeLevel: '2' }],
    [{ level: 'PRIMARIA', gradeLevel: '12' }],
    [{ gradeLevel: '3' }],
    [{ level: 'SUPERIOR' }],
  ])('rechaza %j', (q) => {
    expect(courseSectionsQuerySchema.safeParse(q).success).toBe(false);
    expect(
      dashboardQuerySchema.safeParse({ academicYearId: YEAR, periodId: PERIOD, ...q }).success,
    ).toBe(false);
  });
});

function literalData(): SectionReportData {
  return {
    institution: { name: 'IE', logo: null },
    year: 2026,
    course: 'Comunicación',
    teacher: 'Docente',
    level: 'PRIMARIA',
    gradingScale: 'LITERAL_ADABC',
    gradeLevel: 3,
    sectionCode: 'A',
    period: 'Bimestre 1',
    generatedAt: new Date('2026-05-10T15:00:00Z'),
    riskLiteral: 'C',
    assignments: [{ title: 'T1' }, { title: 'T2' }],
    students: [
      {
        fullName: 'Ana',
        isCurrent: true,
        cells: [
          { state: 'GRADED', value: null, literal: 'AD', isLate: false },
          { state: 'NE', value: null, literal: 'C', isLate: false },
        ],
        average: { status: 'LITERAL_SCALE', counted: 0, exempt: 0 },
        achievement: 'C',
        atRisk: true,
      },
      {
        fullName: 'Beto',
        isCurrent: true,
        cells: [
          { state: 'NE', value: null, literal: null, isLate: false },
          { state: 'EXEMPT', value: null, literal: null, isLate: false },
        ],
        average: { status: 'LITERAL_SCALE', counted: 0, exempt: 1 },
        achievement: null,
        atRisk: false,
      },
    ],
  };
}

describe('reporte de sección en escala literal', () => {
  it('celdas con literal, NE con o sin literal', () => {
    expect(cellValue({ state: 'GRADED', value: null, literal: 'A', isLate: false })).toBe('A');
    expect(cellValue({ state: 'NE', value: null, literal: 'B', isLate: false })).toBe('NE B');
    expect(cellValue({ state: 'NE', value: null, literal: null, isLate: false })).toBe('NE');
  });

  it('XLSX: logro en vez de promedio y etiqueta con nivel', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildSectionXlsx(literalData())) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet(XLSX_SHEET)!;
    expect(ws.getCell('B4').value).toBe('Sección: 3.° Primaria A (2026)');
    const header = ws.getRow(XLSX_TABLE_ROW).values as unknown[];
    expect(header.slice(1)).toEqual(['N.º', 'Estudiante', 'T1', 'T2', 'Logro', 'En riesgo']);
    const ana = ws.getRow(XLSX_TABLE_ROW + 1).values as unknown[];
    expect(ana.slice(3)).toEqual(['AD', 'NE C', 'C', 'Sí']);
    const beto = ws.getRow(XLSX_TABLE_ROW + 2).values as unknown[];
    expect(beto.slice(3)).toEqual(['NE', 'EXO', 'Sin logro', 'No']);
  });

  it('HTML: sin columna de promedio y con leyenda literal', () => {
    const html = buildSectionHtml(literalData());
    expect(html).toContain('<th scope="col">Logro</th>');
    expect(html).not.toContain('Promedio');
    expect(html).toContain('3.° Primaria A (2026)');
    expect(html).toContain('En riesgo: logro C.');
  });

  it('el nombre de archivo lleva el nivel', () => {
    const d = { ...literalData(), level: 'INICIAL' as const, gradeLevel: 5, sectionCode: 'C' };
    expect(reportBaseName(d)).toBe('I5C Comunicación - Bimestre 1');
  });
});

const now = new Date('2026-06-01T00:00:00Z');
const past = new Date('2026-05-01T00:00:00Z');
const from = new Date('2026-03-01T00:00:00Z');

function numericItem(gradeLevel: number, sectionId: string, grades: string[]): DashboardInput {
  const ids = grades.map((_, i) => `${sectionId}-${i}`);
  const book = buildGradebook({
    assignments: [{ id: 'a1', dueAt: past, noSubmissionGrade: '0' }],
    students: ids.map((e) => ({ enrollmentId: e, effectiveFrom: from, effectiveTo: null })),
    cells: ids.map((e, i) => ({
      assignmentId: 'a1',
      enrollmentId: e,
      grade: { state: 'GRADED' as const, value: grades[i] },
      submission: { isLate: false },
    })),
    now,
  });
  return {
    level: 'SECUNDARIA',
    gradingScale: 'NUMERIC_0_20',
    gradeLevel,
    sectionId,
    code: 'A',
    students: book.rows.map((r) => ({
      studentId: r.enrollmentId,
      atRisk: r.atRisk,
      cells: [...r.entries],
    })),
    dashboard: book.dashboard,
  };
}

function literalItem(
  level: 'INICIAL' | 'PRIMARIA',
  gradeLevel: number,
  sectionId: string,
  achievements: (GradeLiteralCode | null)[],
): DashboardInput {
  const ids = achievements.map((_, i) => `${sectionId}-${i}`);
  const book = buildGradebook({
    assignments: [{ id: 'a1', dueAt: past, noSubmissionGrade: '0' }],
    students: ids.map((e) => ({ enrollmentId: e, effectiveFrom: from, effectiveTo: null })),
    cells: ids.map((e) => ({
      assignmentId: 'a1',
      enrollmentId: e,
      grade: { state: 'GRADED' as const, literal: 'A' as const },
      submission: { isLate: false },
    })),
    now,
    gradingScale: 'LITERAL_ADABC',
    achievements: ids.flatMap((e, i) => {
      const literal = achievements[i];
      return literal === null ? [] : [{ enrollmentId: e, literal }];
    }),
  });
  return {
    level,
    gradingScale: 'LITERAL_ADABC',
    gradeLevel,
    sectionId,
    code: 'C',
    students: book.rows.map((r) => ({
      studentId: r.enrollmentId,
      atRisk: r.atRisk,
      cells: [...r.entries],
    })),
    dashboard: book.dashboard,
  };
}

describe('dashboard con tres niveles', () => {
  const items = [
    numericItem(1, 'sec1', ['18', '8']),
    literalItem('PRIMARIA', 1, 'pri1', ['AD', 'C', null]),
    literalItem('INICIAL', 5, 'ini5', ['A']),
  ];
  const r = aggregateDashboard(items, DEFAULT_LITERAL_SCALE);

  it('agrupa por (nivel, grado) en orden y con etiquetas', () => {
    expect(r.grades.map((g) => g.label)).toEqual(['5 años', '1.° Primaria', '1.° Secundaria']);
    expect(r.grades[0].sections[0].label).toBe('5 años C');
    expect(r.grades.map((g) => g.gradingScale)).toEqual([
      'LITERAL_ADABC',
      'LITERAL_ADABC',
      'NUMERIC_0_20',
    ]);
  });

  it('en literal cuenta logros, no promedios; riesgo = logro C', () => {
    const pri = r.grades[1];
    expect(pri.average.status).toBe('LITERAL_SCALE');
    expect(pri.achievements).toEqual({ AD: 1, A: 0, B: 0, C: 1 });
    expect(pri.distribution).toEqual({ AD: 0, A: 0, B: 0, C: 0 });
    expect(pri.noGrades).toBe(1);
    expect(pri.atRiskStudents).toBe(1);
    expect(r.achievementRiskLiteral).toBe('C');
  });

  it('el total es mixto y su promedio solo usa la escala numérica', () => {
    expect(r.total.gradingScale).toBe('MIXED');
    expect(r.total.average).toMatchObject({ status: 'OK', rounded: 13 });
    expect(r.total.distribution).toEqual({ AD: 1, A: 0, B: 0, C: 1 });
    expect(r.total.achievements).toEqual({ AD: 1, A: 1, B: 0, C: 1 });
    expect(r.riskLiteral).toBe('C');
    expect(r.totalByScale.NUMERIC_0_20).toMatchObject({
      gradingScale: 'NUMERIC_0_20',
      students: 2,
    });
    expect(r.totalByScale.LITERAL_ADABC).toMatchObject({
      gradingScale: 'LITERAL_ADABC',
      students: 4,
    });
  });

  it('solo literal: sin literal numérico en riesgo', () => {
    const only = aggregateDashboard([items[1]], DEFAULT_LITERAL_SCALE);
    expect(only.riskLiteral).toBeNull();
    expect(only.total.average.status).toBe('LITERAL_SCALE');
    expect(only.totalByScale.NUMERIC_0_20).toBeNull();
  });
});
