import type { AverageSummary } from '@aula/shared';
import type { GradebookView } from '../grading/grading.types.js';

// Datos de un reporte de curso-sección y período (RF-58), ya calculados por el motor de notas
// (buildGradebook vía GradebookReadService): aquí no se recalcula nada. Es la entrada común de los
// constructores XLSX y HTML. Sin comentarios ni motivo de exoneración (D-049): GradebookView no
// los trae. Sin promedio anual (D-014).

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
  isLate: boolean;
}

export interface SectionReportData {
  institution: ReportInstitution;
  year: number;
  course: string;
  teacher: string | null;
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
      atRisk: s.atRisk,
      cells: s.cells.map((c) => ({ state: c.state, value: c.value, isLate: c.isLate })),
    })),
  };
}

/** "3.º A". */
export const sectionText = (gradeLevel: number, code: string) => `${gradeLevel}.º ${code}`;

/** Celda: número para GRADED, "NE 05" para NE, "EXO" para exonerado, vacío sin nota. */
export function cellValue(cell: ReportCell): number | string {
  if (cell.state === 'EXEMPT') return 'EXO';
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
  data: Pick<SectionReportData, 'gradeLevel' | 'sectionCode' | 'course' | 'period'>,
): string {
  return `${data.gradeLevel}${data.sectionCode} ${data.course} - ${data.period}`;
}
