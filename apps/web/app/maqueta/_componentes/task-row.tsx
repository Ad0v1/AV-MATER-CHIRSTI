import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { cursoStyle, type CursoColor } from './colores';
import { StatusChip, UrgencyChip, type EstadoEntrega, type Urgencia } from './status-chip';

/**
 * Fila de tarea (guia 4.3 y 4.4): franja del color del curso, titulo, curso, plazo en palabras
 * y chip de estado. Toda la fila es UN enlace (el titulo se estira con ::after).
 */
export function TaskRow({
  href,
  titulo,
  curso,
  color,
  plazo,
  estado,
  urgencia,
  nota,
  extra,
  accion,
  className,
}: {
  href: string;
  titulo: string;
  curso?: string;
  color: CursoColor;
  plazo?: string;
  estado?: EstadoEntrega;
  urgencia?: Urgencia;
  nota?: number;
  /** Texto adicional bajo el plazo (p. ej. "18 de 28 entregaron"). */
  extra?: ReactNode;
  /** Pista visual al final de la fila (no interactiva). */
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <li
      style={cursoStyle(color)}
      className={cn(
        'relative flex min-h-16 items-stretch gap-3 rounded-xl bg-surface py-3 pr-3 pl-0 ring-1 ring-line transition-colors hover:bg-row-hover',
        className,
      )}
    >
      <span aria-hidden="true" className="ml-0 w-1 shrink-0 rounded-full bg-(--course)" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-heading text-[1.0625rem] leading-6 font-medium text-ink">
          <Link
            href={href}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            {titulo}
          </Link>
        </h3>
        {curso ? <p className="text-sm text-ink-2">{curso}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {plazo ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
              <Clock className="size-4" aria-hidden="true" />
              {plazo}
            </span>
          ) : null}
          {urgencia ? <UrgencyChip urgencia={urgencia} /> : null}
          {estado ? <StatusChip estado={estado} nota={nota} /> : null}
          {extra ? <span className="text-sm font-semibold text-ink">{extra}</span> : null}
        </div>
      </div>
      <span aria-hidden="true" className="flex shrink-0 items-center text-ink-2">
        {accion ?? <ChevronRight className="size-5" />}
      </span>
    </li>
  );
}
