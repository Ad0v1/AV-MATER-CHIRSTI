import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';

/** Estado vacio (guia 4.7): circulo de 64 px, titulo, una linea y, si hay, una accion. */
export function EmptyState({
  icono: Icono,
  titulo,
  texto,
  accion,
  tono = 'brand',
  className,
}: {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  accion?: ReactNode;
  tono?: 'brand' | 'success';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl bg-surface px-6 py-8 text-center ring-1 ring-line',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-full',
          tono === 'success' ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand',
        )}
      >
        <Icono className="size-8" aria-hidden="true" />
      </span>
      <h3 className="font-heading text-[1.0625rem] font-medium text-ink">{titulo}</h3>
      <p className="max-w-[44ch] text-base text-ink-2">{texto}</p>
      {accion}
    </div>
  );
}
