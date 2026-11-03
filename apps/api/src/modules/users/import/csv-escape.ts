// Escapado de celdas para generar CSV (Decisión 5). Lo usan las plantillas y debe usarlo cualquier
// exportación futura (Dev 5): evita la inyección de fórmulas (CSV/formula injection, OWASP) y
// respeta RFC 4180.

// Caracteres con los que una hoja de cálculo puede interpretar la celda como fórmula.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// Caracteres que obligan a encerrar la celda entre comillas (RFC 4180, más ';' para Excel en es-PE).
const NEEDS_QUOTES = /[",;\r\n]/;

/**
 * Celda segura para CSV: antepone un apóstrofo si empieza por = + - @, TAB o CR, y la encierra
 * entre comillas (duplicando las internas) si contiene comillas, separadores o saltos de línea.
 */
export function escapeCsvCell(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Línea CSV (sin salto final) con las celdas escapadas. */
export const toCsvLine = (cells: readonly string[], separator = ','): string =>
  cells.map(escapeCsvCell).join(separator);
