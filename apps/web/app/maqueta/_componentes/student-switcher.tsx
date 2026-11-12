'use client';

import { cn } from 'cn';

export type Hijo = { id: string; nombre: string; grado: string };

/** Selector de estudiante del apoderado (guia 4.3): chips-avatar de >= 44 px con aria-pressed. */
export function StudentSwitcher({
  hijos,
  seleccionado,
  onSeleccionar,
}: {
  hijos: Hijo[];
  seleccionado: string;
  onSeleccionar: (id: string) => void;
}) {
  return (
    <div role="group" aria-label="Elegir estudiante" className="flex flex-wrap gap-2">
      {hijos.map((hijo) => {
        const activo = hijo.id === seleccionado;
        return (
          <button
            key={hijo.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onSeleccionar(hijo.id)}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-full border-2 py-1.5 pr-4 pl-1.5 text-left transition-colors',
              activo ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-row-hover',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'font-heading flex size-9 items-center justify-center rounded-full text-base font-semibold',
                activo ? 'bg-brand text-white' : 'bg-surface-2 text-brand',
              )}
            >
              {hijo.nombre.charAt(0)}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-ink">{hijo.nombre}</span>
              <span className="text-sm text-ink-2">{hijo.grado}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
