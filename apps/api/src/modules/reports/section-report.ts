import {
  sectionLabel,
  type AverageSummary,
  type EducationLevel,
  type GradeLiteralCode,
  type GradingScale,
} from '@aula/shared';
import type { GradebookView } from '../grading/grading.types.js';

// Datos de un reporte de curso-sección y período (RF-58), ya calculados por el motor de notas
// (buildGradebook vía GradebookReadService): aquí no se recalcula nada. Es la entrada común de los
// constructores XLSX y HTML. Sin comentarios ni motivo de exoneración (D-049): GradebookView no
// los trae. Sin promedio anual (D-014).
// Tres niveles (09/11/2026): en escala literal (INICIAL, PRIMARIA) cada celda lleva su literal
// AD/A/B/C y, en vez de promedio, va el logro del bimestre (PeriodAchievement) que eligió el
// docente; en riesgo es lo que dice el motor (logro C). El comentario del logro NO entra en los
// reportes institucionales (solo lo ven el docente, el estudiante y su apoderado).

export const LOGO_MIMES = ['image/png', 'image/jpeg'] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];

export interface ReportLogo {
  mime: LogoMime;
  data: Buffer;
}

export interface ReportInstitution {
  name: string;
  logo: ReportLogo | null;
}

export interface ReportCell {
  /** null = sin nota (ni guardada ni NE virtual). */
  state: 'GRADED' | 'NE' | 'EXEMPT' | null;
  value: string | null;
  /** Escala literal: AD/A/B/C; null en escala numérica o NE sin literal. */
  literal?: GradeLiteralCode | null;
  isLate: boolean;
}

export interface SectionReportData {
  institution: ReportInstitution;
  year: number;
  course: string;
  teacher: string | null;
  level: EducationLevel;
  gradingScale: GradingScale;
  gradeLevel: number;
  sectionCode: string;
  period: string;
  generatedAt: Date;
  riskLiteral: string;
  assignments: { title: string }[];
  students: {
    fullName: string;
    isCurrent: boolean;
    cells: ReportCell[];
    average: AverageSummary;
    /** Logro del bimestre (escala literal); null sin logro o en escala numérica. Sin comentario. */
    achievement?: GradeLiteralCode | null;
    atRisk: boolean;
  }[];
}

export function toSectionReportData(
  view: GradebookView,
  meta: { institution: ReportInstitution; year: number; teacher: string | null; now: Date },
): SectionReportData {
  return {
    institution: meta.institution,
    year: meta.year,
    course: view.courseSection.course.name,
    teacher: meta.teacher,
    level: view.courseSection.section.level,
    gradingScale: view.courseSection.gradingScale,
    gradeLevel: view.courseSection.section.gradeLevel,
    sectionCode: view.courseSection.section.code,
    period: view.period.label,
    generatedAt: meta.now,
    riskLiteral: view.dashboard.riskLiteral,
    assignments: view.assignments.map((a) => ({ title: a.title })),
    students: view.students.map((s) => ({
      fullName: s.fullName,
      isCurrent: s.isCurrent,
      average: s.average,
      achievement: s.achievement?.literal ?? null,
      atRisk: s.atRisk,
      cells: s.cells.map((c) => ({
        state: c.state,
        value: c.value,
        literal: c.literal,
        isLate: c.isLate,
      })),
    })),
  };
}

/** "3.° Primaria A", "5 años C", "2.° Secundaria B". */
export const sectionText = (level: EducationLevel, gradeLevel: number, code: string) =>
  sectionLabel(level, gradeLevel, code);

export const isLiteralReport = (data: Pick<SectionReportData, 'gradingScale'>) =>
  data.gradingScale === 'LITERAL_ADABC';

/**
 * Celda: número para GRADED, "NE 05" para NE, "EXO" para exonerado, vacío sin nota. En escala
 * literal: el literal ("A"), "NE C" o "NE" si la NE no tiene literal.
 */
export function cellValue(cell: ReportCell): number | string {
  if (cell.state === 'EXEMPT') return 'EXO';
  if (cell.literal !== null && cell.literal !== undefined) {
    return cell.state === 'NE' ? `NE ${cell.literal}` : cell.literal;
  }
  if (cell.state === 'NE' && cell.value === null) return 'NE';
  if (cell.state === null || cell.value === null) return '';
  if (cell.state === 'NE') return `NE ${cell.value}`;
  const n = Number(cell.value);
  return Number.isFinite(n) ? n : cell.value;
}

/** Promedio redondeado o null si no hay notas que cuenten (D-026). */
export const averageValue = (a: AverageSummary): number | null =>
  a.status === 'OK' ? a.rounded : null;

export const averageLiteral = (a: AverageSummary): string =>
  a.status === 'OK' ? a.literal : 'Sin notas';

/** Logro del bimestre o "Sin logro" (escala literal). */
export const achievementText = (literal: GradeLiteralCode | null | undefined): string =>
  literal ?? 'Sin logro';

/** Leyenda al pie del reporte según la escala. */
export function legendText(data: Pick<SectionReportData, 'gradingScale' | 'riskLiteral'>): string {
  if (isLiteralReport(data)) {
    return `Escala literal AD/A/B/C sin promedio. NE: no entregó. EXO: exonerado. Logro: logro del bimestre que eligió el docente. En riesgo: logro ${data.riskLiteral}.`;
  }
  return `NE: no entregó. EXO: exonerado. En riesgo: promedio con literal ${data.riskLiteral}.`;
}

/** Fecha y hora de Lima para la cabecera (sin depender de la zona del servidor). */
export function limaTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** Nombre de archivo del reporte dentro de un ZIP o en la descarga (sin datos personales). */
export function reportBaseName(
  data: Pick<SectionReportData, 'level' | 'gradeLevel' | 'sectionCode' | 'course' | 'period'>,
): string {
  return `${LEVEL_FILE_PREFIX[data.level]}${data.gradeLevel}${data.sectionCode} ${data.course} - ${data.period}`;
}

/** Prefijo del nivel en el nombre de archivo ("I5C", "P3A", "S2B"): evita choques en el ZIP. */
const LEVEL_FILE_PREFIX: Record<EducationLevel, string> = {
  INICIAL: 'I',
  PRIMARIA: 'P',
  SECUNDARIA: 'S',
};
