import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WIDTH = {
  /** Lectura y formularios cortos (anuncios). */
  narrow: 'max-w-3xl',
  /** Ancho estándar de las pantallas del aula. */
  default: 'max-w-5xl',
  /** Tablas anchas (registro del docente). */
  wide: 'max-w-6xl',
} as const;

export type PageShellWidth = keyof typeof WIDTH;

/**
 * Contenedor de página: centrado, ancho acotado, relleno 16 px (móvil) / 32 px (md) y separación
 * estándar entre bloques. Es un <div>, no <main>: el <main> ya lo pone SidebarInset en el layout.
 */
export function PageShell({
  width = 'default',
  className,
  children,
}: {
  width?: PageShellWidth;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mx-auto flex w-full flex-col gap-6 p-4 md:p-8', WIDTH[width], className)}>
      {children}
    </div>
  );
}
