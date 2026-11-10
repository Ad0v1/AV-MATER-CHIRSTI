import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';

export type DestinoNav = {
  clave: string;
  etiqueta: string;
  href: string;
  icono: LucideIcon;
  /** Avisos sin leer (se muestra "9+" como tope). */
  contador?: number;
};

/**
 * Barra inferior movil (guia 3.2): 64 px + safe-area, 4 destinos con etiqueta siempre visible.
 * El activo se distingue por pildora y peso, ademas del color.
 */
export function BottomNav({ destinos, activo }: { destinos: DestinoNav[]; activo: string }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-(--shadow-nav) md:hidden"
    >
      <ul className="flex h-16">
        {destinos.map(({ clave, etiqueta, href, icono: Icono, contador }) => {
          const esActivo = clave === activo;
          return (
            <li key={clave} className="flex-1">
              <Link
                href={href}
                aria-current={esActivo ? 'page' : undefined}
                className={cn(
                  'flex h-full min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 text-xs',
                  esActivo ? 'font-semibold text-brand' : 'font-semibold text-ink-2',
                )}
              >
                <span
                  className={cn(
                    'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                    esActivo && 'bg-brand-soft',
                  )}
                >
                  <Icono className="size-6" aria-hidden="true" />
                  {contador ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 right-2 flex size-4 items-center justify-center rounded-full bg-danger text-[0.6875rem] leading-none font-semibold text-white"
                    >
                      {contador > 9 ? '9+' : contador}
                    </span>
                  ) : null}
                </span>
                <span>{etiqueta}</span>
                {contador ? <span className="sr-only">{contador} avisos nuevos</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
