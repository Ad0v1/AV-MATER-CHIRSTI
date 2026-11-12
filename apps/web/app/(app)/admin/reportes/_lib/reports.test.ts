import { describe, expect, it } from 'vitest';
import {
  averageText,
  courseSectionsQuery,
  type DashboardBucket,
  distributionTotal,
  gradebookHref,
  gradeLevels,
  levelsOf,
  literalMeaning,
  isExportRequest,
  parseFilters,
  percent,
  pickPeriod,
} from './reports';

const Y = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const P = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const S = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';

describe('filtros de /admin/reportes', () => {
  it('acepta solo ids y grados válidos', () => {
    expect(
      parseFilters({ anio: Y, periodo: P, nivel: 'PRIMARIA', grado: '3', seccion: S }),
    ).toEqual({
      yearId: Y,
      periodId: P,
      level: 'PRIMARIA',
      gradeLevel: 3,
      sectionId: S,
    });
    expect(parseFilters({ anio: 'x', periodo: ['<s>'], grado: '13', seccion: '' })).toEqual({
      yearId: null,
      periodId: null,
      level: null,
      gradeLevel: null,
      sectionId: null,
    });
    expect(parseFilters({ nivel: 'SECUNDARIA', grado: '2.5' }).gradeLevel).toBeNull();
    // Tres niveles: sin nivel no hay grado; el grado debe existir en el nivel.
    expect(parseFilters({ grado: '3' }).gradeLevel).toBeNull();
    expect(parseFilters({ nivel: 'SECUNDARIA', grado: '6' }).gradeLevel).toBeNull();
    expect(parseFilters({ nivel: 'INICIAL', grado: '5' })).toMatchObject({
      level: 'INICIAL',
      gradeLevel: 5,
    });
    expect(parseFilters({ nivel: 'superior' }).level).toBeNull();
  });

  it('arma la query del listado sin el período', () => {
    expect(
      courseSectionsQuery({
        yearId: Y,
        periodId: P,
        level: 'SECUNDARIA',
        gradeLevel: 1,
        sectionId: S,
      }),
    ).toBe(`?academicYearId=${Y}&level=SECUNDARIA&gradeLevel=1&sectionId=${S}`);
    expect(
      courseSectionsQuery({
        yearId: null,
        periodId: null,
        level: null,
        gradeLevel: null,
        sectionId: null,
      }),
    ).toBe('');
  });

  it('elige el período del año o el primero', () => {
    const periods = [
      { id: 'a', label: 'I', sequence: 1 },
      { id: P, label: 'II', sequence: 2 },
    ];
    expect(pickPeriod(P, periods)).toBe(P);
    expect(pickPeriod(S, periods)).toBe('a');
    expect(pickPeriod(null, [])).toBeNull();
  });

  it('grados distintos del nivel, en orden, y niveles presentes', () => {
    const sections = [
      { id: '1', level: 'SECUNDARIA' as const, gradeLevel: 3, code: 'A' },
      { id: '2', level: 'SECUNDARIA' as const, gradeLevel: 1, code: 'B' },
      { id: '3', level: 'SECUNDARIA' as const, gradeLevel: 3, code: 'B' },
      { id: '4', level: 'INICIAL' as const, gradeLevel: 5, code: 'C' },
    ];
    expect(gradeLevels(sections, 'SECUNDARIA')).toEqual([1, 3]);
    expect(gradeLevels(sections, 'INICIAL')).toEqual([5]);
    expect(gradeLevels(sections, 'PRIMARIA')).toEqual([]);
    expect(levelsOf(sections)).toEqual(['INICIAL', 'SECUNDARIA']);
  });

  it('enlace al registro con el período codificado', () => {
    expect(gradebookHref(S, P)).toBe(`/curso/${S}/registro?periodo=${P}`);
    expect(gradebookHref(S, null)).toBe(`/curso/${S}/registro`);
  });
});

describe('presentación del dashboard', () => {
  it('promedio, porcentaje y total de la distribución', () => {
    expect(averageText({ status: 'OK', rounded: 14, literal: 'A', counted: 3, exempt: 0 })).toBe(
      '14 (A)',
    );
    expect(averageText({ status: 'NO_GRADES', counted: 0, exempt: 0 })).toBe('Sin notas');
    expect(percent(1, 3)).toBe('33 %');
    expect(percent(0, 0)).toBe('0 %');
    const b = { distribution: { AD: 1, A: 2 }, noGrades: 1 } as unknown as DashboardBucket;
    expect(distributionTotal(b)).toBe(4);
    // Escala literal: sin promedio; el total cuenta logros.
    expect(averageText({ status: 'LITERAL_SCALE', counted: 0, exempt: 0 })).toBe('Escala literal');
    const lit = {
      gradingScale: 'LITERAL_ADABC',
      distribution: { AD: 9 },
      achievements: { AD: 1, C: 2 },
      noGrades: 1,
    } as unknown as DashboardBucket;
    expect(distributionTotal(lit)).toBe(4);
  });
});

describe('isExportRequest', () => {
  it('valida tipo, formato e ids', () => {
    expect(
      isExportRequest({ type: 'SECTION_EXPORT', courseSectionId: S, periodId: P, format: 'XLSX' }),
    ).toBe(true);
    expect(
      isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, periodId: P, format: 'PDF' }),
    ).toBe(true);
    expect(
      isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, periodId: P, format: 'CSV' }),
    ).toBe(false);
    expect(
      isExportRequest({
        type: 'SECTION_EXPORT',
        courseSectionId: '../x',
        periodId: P,
        format: 'PDF',
      }),
    ).toBe(false);
    expect(
      isExportRequest({
        type: 'SECTION_EXPORT',
        courseSectionId: S,
        periodId: P,
        format: 'PDF',
        extra: 1,
      }),
    ).toBe(false);
    expect(isExportRequest({ type: 'YEAR_BACKUP', periodId: P, format: 'PDF' })).toBe(false);
    expect(isExportRequest(null)).toBe(false);
  });
});

describe('límites de reports.ts (RF-57..60)', () => {
  it('parseFilters: con PRIMARIA pasan 1 y 6; 0, 7, 12, -1, vacío, NaN y decimales se ignoran', () => {
    expect(parseFilters({ nivel: 'PRIMARIA', grado: '1' }).gradeLevel).toBe(1);
    expect(parseFilters({ nivel: 'PRIMARIA', grado: '6' }).gradeLevel).toBe(6);
    for (const g of ['0', '7', '12', '13', '-1', '', 'abc', '1.5', '1e1x', ' ']) {
      expect(parseFilters({ nivel: 'PRIMARIA', grado: g }).gradeLevel).toBeNull();
    }
    expect(parseFilters({}).gradeLevel).toBeNull();
    expect(parseFilters({ grado: undefined }).gradeLevel).toBeNull();
  });

  it('parseFilters: con arreglos toma el primer valor y rechaza ids con HTML o rutas', () => {
    expect(parseFilters({ anio: [Y, 'x'], periodo: [P], seccion: [S] })).toMatchObject({
      yearId: Y,
      periodId: P,
      sectionId: S,
    });
    expect(parseFilters({ anio: ['x', Y] }).yearId).toBeNull();
    expect(parseFilters({ anio: '<script>', periodo: '../..', seccion: `${S}'` })).toMatchObject({
      yearId: null,
      periodId: null,
      sectionId: null,
    });
  });

  it('courseSectionsQuery: solo con filtros presentes y el grado incluido', () => {
    expect(
      courseSectionsQuery({
        yearId: null,
        periodId: P,
        level: 'PRIMARIA',
        gradeLevel: 6,
        sectionId: null,
      }),
    ).toBe('?level=PRIMARIA&gradeLevel=6');
    expect(
      courseSectionsQuery({
        yearId: null,
        periodId: P,
        level: null,
        gradeLevel: 3,
        sectionId: null,
      }),
    ).toBe('');
    expect(
      courseSectionsQuery({
        yearId: Y,
        periodId: null,
        level: null,
        gradeLevel: null,
        sectionId: null,
      }),
    ).toBe(`?academicYearId=${Y}`);
  });

  it('pickPeriod: lista vacía con id, o id de otro año, cae al primero o null', () => {
    expect(pickPeriod(P, [])).toBeNull();
    expect(pickPeriod(P, [{ id: 'a', label: 'I', sequence: 1 }])).toBe('a');
  });

  it('gradeLevels: vacío y repetidos', () => {
    expect(gradeLevels([], 'SECUNDARIA')).toEqual([]);
    expect(
      gradeLevels(
        [
          { id: '1', level: 'SECUNDARIA', gradeLevel: 2, code: 'A' },
          { id: '2', level: 'SECUNDARIA', gradeLevel: 2, code: 'B' },
        ],
        'SECUNDARIA',
      ),
    ).toEqual([2]);
  });

  it('gradebookHref: codifica ids raros', () => {
    expect(gradebookHref('a/b?c', 'p&q')).toBe('/curso/a%2Fb%3Fc/registro?periodo=p%26q');
  });

  it('percent: redondeo, tope 100 % y totales no positivos', () => {
    expect(percent(1, 2)).toBe('50 %');
    expect(percent(1, 200)).toBe('1 %');
    expect(percent(1, 201)).toBe('0 %');
    expect(percent(3, 3)).toBe('100 %');
    expect(percent(5, 0)).toBe('0 %');
    expect(percent(5, -1)).toBe('0 %');
    expect(percent(0, 7)).toBe('0 %');
  });

  it('averageText: nota 0 es "0 (C)", no "Sin notas"', () => {
    expect(averageText({ status: 'OK', rounded: 0, literal: 'C', counted: 1, exempt: 0 })).toBe(
      '0 (C)',
    );
    expect(averageText({ status: 'NO_GRADES', counted: 0, exempt: 3 })).toBe('Sin notas');
  });

  it('distributionTotal: vacía suma solo los sin notas', () => {
    expect(distributionTotal({ distribution: {}, noGrades: 0 } as unknown as DashboardBucket)).toBe(
      0,
    );
    expect(distributionTotal({ distribution: {}, noGrades: 4 } as unknown as DashboardBucket)).toBe(
      4,
    );
  });

  it('isExportRequest: rechaza no objetos, arreglos, ids cruzados, faltantes y claves heredadas', () => {
    for (const v of [undefined, 'x', 1, [], [{}], {}]) expect(isExportRequest(v)).toBe(false);
    // Ids del tipo equivocado.
    expect(
      isExportRequest({ type: 'SECTION_EXPORT', academicYearId: Y, periodId: P, format: 'PDF' }),
    ).toBe(false);
    expect(
      isExportRequest({ type: 'BULK_EXPORT', courseSectionId: S, periodId: P, format: 'PDF' }),
    ).toBe(false);
    // Faltan período o formato.
    expect(isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, format: 'PDF' })).toBe(false);
    expect(isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, periodId: P })).toBe(false);
    // Formato en minúscula, periodId con HTML, campo extra en BULK.
    expect(
      isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, periodId: P, format: 'pdf' }),
    ).toBe(false);
    expect(
      isExportRequest({ type: 'BULK_EXPORT', academicYearId: Y, periodId: '<b>', format: 'PDF' }),
    ).toBe(false);
    expect(
      isExportRequest({
        type: 'BULK_EXPORT',
        academicYearId: Y,
        periodId: P,
        format: 'XLSX',
        courseSectionId: S,
      }),
    ).toBe(false);
  });
});

describe('literalMeaning', () => {
  it('AD, A, B y C con su significado; otros, a Configuración', () => {
    expect(literalMeaning('AD')).toBe('logro destacado');
    expect(literalMeaning('C')).toBe('en inicio');
    expect(literalMeaning('X')).toMatch(/Configuración/);
  });
});
