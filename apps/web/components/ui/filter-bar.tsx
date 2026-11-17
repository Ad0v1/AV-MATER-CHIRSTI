import type { ReactNode } from 'react';
import { cn } from 'cn';

/**
 * Barra de filtros: los campos van en una rejilla que se reparte sola (columnas de mínimo 12 rem)
 * y alinea sus bases; los textos de ayuda y las acciones van en filas aparte, para que una pista
 * larga no desalinee los campos.
 */
export function FilterBar({
  children,
  actions,
  help,
  className,
}: {
  /** Los campos (cada uno con su etiqueta). */
  children: ReactNode;
  /** Botones (Filtrar, Quitar filtros…), en una fila bajo los campos. */
  actions?: ReactNode;
  /** Textos de ayuda de la barra (no de un campo concreto), fuera de la rejilla. */
  help?: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="filter-bar" className={cn('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] items-end gap-3">
        {children}
      </div>
      {help}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
