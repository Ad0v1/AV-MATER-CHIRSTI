// Lógica pura de /admin/reportes (RF-57..60), probada con Vitest. Tipos copiados de
// apps/api/src/modules/reports/reports.service.ts y dashboard-aggregate.ts.
import { isUuid } from '../../_shared/lib/validation';
import type { JobView } from '../../almacenamiento/_lib/storage';

export const REPORTS_PATH = '/admin/reportes';

export type ReportFormat = 'XLSX' | 'PDF';

export const FORMAT_LABEL: Record<ReportFormat, string> = { XLSX: 'Excel', PDF: 'PDF' };

export interface ReportCourseSectionsView {
  academicYear: { id: string; year: number; isActive: boolean; closedAt: string | null } | null;
  years: { id: string; year: number; isActive: boolean }[];
  periods: { id: string; label: string; sequence: number }[];
  sections: { id: string; gradeLevel: number; code: string }[];
  items: {
    courseSectionId: string;
    isActive: boolean;
    course: { id: string; name: string };
    section: { id: string; gradeLevel: number; code: string };
    teacher: { id: string; fullName: string } | null;
  }[];
}

export type AverageSummary =
  | { status: 'OK'; rounded: number; literal: string; counted: number; exempt: number }
  | { status: 'NO_GRADES'; counted: 0; exempt: number };

export interface DashboardBucket {
  average: AverageSummary;
  distribution: Record<string, number>;
  noGrades: number;
  atRiskStudents: number;
  atRiskEntries: number;
  students: number;
  counts: { onTime: number; late: number; ne: number };
  courseSections: number;
}

export interface ReportsDashboardView {
  academicYear: { id: string; year: number };
  period: { id: string; label: string; sequence: number };
  literals: string[];
  riskLiteral: string | null;
  total: DashboardBucket;
  grades: (DashboardBucket & {
    gradeLevel: number;
    sections: (DashboardBucket & { sectionId: string; code: string })[];
  })[];
}

export type ExportRequest =
  | { type: 'SECTION_EXPORT'; courseSectionId: string; periodId: string; format: ReportFormat }
  | { type: 'BULK_EXPORT'; academicYearId: string; periodId: string; format: ReportFormat };

export type ExportAccepted = { jobId: string; job: JobView };

export interface ReportFilters {
  yearId: string | null;
  periodId: string | null;
  gradeLevel: number | null;
  sectionId: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Filtros de la URL (?anio, ?periodo, ?grado, ?seccion); lo inválido se ignora. */
export function parseFilters(params: Params): ReportFilters {
  const year = first(params.anio);
  const period = first(params.periodo);
  const section = first(params.seccion);
  const grade = Number(first(params.grado));
  return {
    yearId: isUuid(year) ? year : null,
    periodId: isUuid(period) ? period : null,
    gradeLevel: Number.isInteger(grade) && grade >= 1 && grade <= 12 ? grade : null,
    sectionId: isUuid(section) ? section : null,
  };
}

/** Query del listado de la API (sin el período, que solo usa la web). */
export function courseSectionsQuery(f: ReportFilters): string {
  const q = new URLSearchParams();
  if (f.yearId) q.set('academicYearId', f.yearId);
  if (f.gradeLevel !== null) q.set('gradeLevel', String(f.gradeLevel));
  if (f.sectionId) q.set('sectionId', f.sectionId);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Período pedido si es del año; si no, el primero. */
export function pickPeriod(
  periodId: string | null,
  periods: ReportCourseSectionsView['periods'],
): string | null {
  if (periodId && periods.some((p) => p.id === periodId)) return periodId;
  return periods[0]?.id ?? null;
}

/** Grados distintos de las secciones del año, en orden. */
export function gradeLevels(sections: ReportCourseSectionsView['sections']): number[] {
  return [...new Set(sections.map((s) => s.gradeLevel))].sort((a, b) => a - b);
}

/** Enlace al registro del curso-sección (RF-57, pantalla de Dev 4 que admite ADMIN). */
export function gradebookHref(courseSectionId: string, periodId: string | null): string {
  const base = `/curso/${encodeURIComponent(courseSectionId)}/registro`;
  return periodId ? `${base}?periodo=${encodeURIComponent(periodId)}` : base;
}

export function averageText(a: AverageSummary): string {
  return a.status === 'OK' ? `${a.rounded} (${a.literal})` : 'Sin notas';
}

/** Porcentaje entero de `part` sobre `total`; "0 %" si total es 0. */
export function percent(part: number, total: number): string {
  if (total <= 0) return '0 %';
  return `${Math.round((part / total) * 100)} %`;
}

/** Suma de la distribución más los que no tienen notas. */
export function distributionTotal(b: DashboardBucket): number {
  return Object.values(b.distribution).reduce((s, n) => s + n, 0) + b.noGrades;
}

/** Valida el cuerpo antes de enviarlo a la API (ids del navegador). */
export function isExportRequest(value: unknown): value is ExportRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.format !== 'XLSX' && v.format !== 'PDF') return false;
  if (!isUuid(v.periodId)) return false;
  if (v.type === 'SECTION_EXPORT') return isUuid(v.courseSectionId) && Object.keys(v).length === 4;
  if (v.type === 'BULK_EXPORT') return isUuid(v.academicYearId) && Object.keys(v).length === 4;
  return false;
}

const LITERAL_MEANING: Record<string, string> = {
  AD: 'logro destacado',
  A: 'logro esperado',
  B: 'en proceso',
  C: 'en inicio',
};

/** Significado de un literal de la escala por defecto; uno configurado distinto no lo tiene. */
export function literalMeaning(literal: string): string {
  return LITERAL_MEANING[literal] ?? 'según la tabla de literales de Configuración';
}
