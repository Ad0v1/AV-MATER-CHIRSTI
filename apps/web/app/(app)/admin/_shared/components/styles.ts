// Clases compartidas (módulo sin 'use client' para poder usarlas en Server Components).

/** Botones: 44 px en móvil (objetivo táctil, RNF-24..27) y 36 px desde md, como los campos. */
export const TOUCH = 'min-h-11 px-4 md:min-h-9';

/** Alto de inputs y selects: 44 px en móvil, 36 px desde md. */
export const CONTROL = 'h-11 md:h-9';

/**
 * Campos con relleno suave y sin contorno (diseño limpio). Se aplica al contenedor del formulario;
 * el foco y el error siguen mostrando su borde porque esos estados tienen más especificidad.
 */
export const SOFT_FIELDS =
  '[&_input]:border-transparent [&_input]:bg-surface-2 [&_input]:shadow-none [&_select]:border-transparent [&_select]:bg-surface-2 [&_select]:shadow-none dark:[&_select]:bg-surface-2 [&_label]:text-sm [&_label]:text-muted-foreground';
