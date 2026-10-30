// Hora de Perú (Lima) para el calendario (RF-54): UTC-5 fijo, sin horario de verano desde 1994.
// Lógica pura (probada con Vitest); la usa el plugin de zona horaria de FullCalendar, así el
// calendario, el aria-label (formatDue) y la API muestran la misma hora en cualquier dispositivo.

export const LIMA_TIME_ZONE = 'America/Lima';
/** Desfase de Lima respecto de UTC, en minutos (convención de FullCalendar y Luxon). */
export const LIMA_OFFSET_MINUTES = -300;

/** Instante (ms UTC) → [año, mes 0-11, día, hora, minuto, segundo, ms] en hora de Lima. */
export function limaArrayFromTimestamp(ms: number): number[] {
  const d = new Date(ms + LIMA_OFFSET_MINUTES * 60_000);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  ];
}
