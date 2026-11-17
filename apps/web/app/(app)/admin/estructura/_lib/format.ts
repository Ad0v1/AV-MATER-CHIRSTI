// Formatos de presentación (lógica pura, probada con Vitest).
// - Fechas solo-día: se muestran tal cual, YYYY-MM-DD (sin pasar por Date, para no correr un día).
// - Instantes (closedAt): es-PE en America/Lima.
import type { StatusTone } from '../../_shared/lib/format';
import type { YearSummary } from './types';

import { sectionLabel as levelSectionLabel, type EducationLevel } from './levels';

export { formatInstant, type StatusTone } from '../../_shared/lib/format';

/**
 * Etiqueta de sección con nivel (tres niveles, 09/11/2026): "3.° Primaria A", "5 años C".
 * Sin nivel se asume SECUNDARIA (valor por defecto del esquema).
 */
export function sectionLabel(
  gradeLevel: number,
  code: string,
  level: EducationLevel = 'SECUNDARIA',
): string {
  return levelSectionLabel(level, gradeLevel, code);
}

export type YearStatus = { label: string; tone: StatusTone; detail: string };

/** Estado visible de un año (RN-11, D-030). */
export function yearStatus(
  year: Pick<YearSummary, 'isActive' | 'closedAt' | 'readOnly'>,
): YearStatus {
  if (year.closedAt) {
    return { label: 'Cerrado', tone: 'closed', detail: 'Solo lectura.' };
  }
  if (year.isActive) {
    return { label: 'Activo', tone: 'active', detail: 'Año en curso.' };
  }
  if (year.readOnly) {
    return { label: 'Inactivo', tone: 'inactive', detail: 'Anterior al activo: solo lectura.' };
  }
  return { label: 'En preparación', tone: 'future', detail: 'Se puede preparar y activar.' };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Fecha solo-día legible: "2026-03-01" -> "1 mar 2026". Se arma partiendo el texto, sin pasar
 * por Date, para no correr un día por la zona horaria. Si no tiene el formato, la devuelve igual.
 */
export function formatDateOnly(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return value;
  return `${Number(m[3])} ${month} ${m[1]}`;
}
