// Escapes de los reportes (RF-58, D-035, U4). Todo texto que viene de la BD (nombres de curso,
// docente, estudiantes, títulos de tareas, nombre institucional) pasa por aquí antes de ir a una
// celda de Excel o al HTML que convierte Gotenberg.

/** Caracteres con los que una hoja de cálculo interpreta la celda como fórmula (igual que csv-escape). */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Texto seguro para una celda de exceljs: el equivalente de escapeCsvCell sin las comillas de
 * CSV (D-035). Antepone un apóstrofo si empieza por = + - @, TAB o CR y quita los caracteres de
 * control que no admite XML (salvo TAB, LF y CR).
 */
export function spreadsheetText(value: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return FORMULA_TRIGGER.test(clean) ? `'${clean}` : clean;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Texto seguro para el HTML del PDF (contenido y atributos entre comillas dobles). */
export function htmlText(value: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return clean.replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}
