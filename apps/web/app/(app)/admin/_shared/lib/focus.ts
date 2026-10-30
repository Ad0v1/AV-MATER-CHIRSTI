// Destinos de foco tras una acción exitosa (ux-accesibilidad, Decisiones 1–3 de la entrega 5a).
// Lógica pura común a las pantallas de administración. Los ids propios de cada módulo viven en
// su `_lib/focus.ts` (estructura) o `_lib/users.ts` (usuarios).

/** `<h1>` de cada página: respaldo cuando el elemento afectado ya no existe. */
export const PAGE_TITLE_ID = 'titulo-pagina';

/** Clases de los encabezados que reciben foco por código. */
export const FOCUS_HEADING =
  'scroll-mt-4 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring';

/**
 * Primer id de la lista que existe en la página; si ninguno existe, el título de la página.
 * `exists` se inyecta para poder probarlo sin DOM.
 */
export function pickFocusTarget(
  candidates: readonly (string | null | undefined)[],
  exists: (id: string) => boolean,
): string | null {
  for (const id of candidates) {
    if (id && exists(id)) return id;
  }
  return exists(PAGE_TITLE_ID) ? PAGE_TITLE_ID : null;
}

/** Enfoca el destino en el navegador (encabezado afectado o, si no, el título). */
export function focusAfterSuccess(focusId?: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const id = pickFocusTarget([focusId], (x) => document.getElementById(x) !== null);
  const el = id ? document.getElementById(id) : null;
  el?.focus();
  return el;
}
