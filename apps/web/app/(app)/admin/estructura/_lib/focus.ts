// Destinos de foco de /admin/estructura (ux-accesibilidad, Decisiones 1–3 de la entrega 5a).
// Lo común (título de página, clases y elección del destino) vive en admin/_shared/lib/focus.ts.
export {
  FOCUS_HEADING,
  PAGE_TITLE_ID,
  focusAfterSuccess,
  pickFocusTarget,
} from '../../_shared/lib/focus';

export const focusIds = {
  period: (id: string) => `periodo-${id}`,
  section: (id: string) => `seccion-${id}`,
  course: (id: string) => `curso-${id}`,
  courseSection: (id: string) => `curso-seccion-${id}`,
  /** Encabezado del resultado de clonar la estructura (RF-15). */
  cloneResult: 'resultado-clonacion',
} as const;
