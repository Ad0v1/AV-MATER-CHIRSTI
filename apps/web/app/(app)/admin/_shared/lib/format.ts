// Formatos de presentación comunes (lógica pura, probada con Vitest).
// - Fechas solo-día: se muestran tal cual, YYYY-MM-DD (sin pasar por Date, para no correr un día).
// - Instantes: es-PE en America/Lima.

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
