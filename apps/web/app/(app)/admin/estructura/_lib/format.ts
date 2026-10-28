// Formatos de presentación (lógica pura, probada con Vitest).
// - Fechas solo-día: se muestran tal cual, YYYY-MM-DD (sin pasar por Date, para no correr un día).
// - Instantes (closedAt): es-PE en America/Lima.
import type { YearSummary } from './types';

const instantFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Instante ISO-8601 en hora de Lima; cadena vacía si no es válido. */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : instantFormatter.format(d);
}

/** "3.º A". */
export function sectionLabel(gradeLevel: number, code: string): string {
  return `${gradeLevel}.º ${code}`;
}

export type StatusTone = 'active' | 'closed' | 'inactive' | 'future';

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
