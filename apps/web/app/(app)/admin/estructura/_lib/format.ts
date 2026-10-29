// Formatos de presentación (lógica pura, probada con Vitest).
// - Fechas solo-día: se muestran tal cual, YYYY-MM-DD (sin pasar por Date, para no correr un día).
// - Instantes (closedAt): es-PE en America/Lima.
import type { StatusTone } from '../../_shared/lib/format';
import type { YearSummary } from './types';

export { formatInstant, sectionLabel, type StatusTone } from '../../_shared/lib/format';

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
