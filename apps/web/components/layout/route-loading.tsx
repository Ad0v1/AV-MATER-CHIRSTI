'use client';

import { usePathname } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { routeMetaFor } from '@/lib/route-meta';
import { cn } from '@/lib/utils';
import { Breadcrumbs } from './breadcrumbs';
import { PageLoadingSkeleton } from './page-loading-skeleton';

/**
 * Estado de carga al cambiar de módulo. Si la ruta es un módulo conocido, muestra su título y
 * descripción reales al instante (vienen de lib/route-meta, igual que la página) y deja en
 * skeleton solo el contenido. Si no, usa el esqueleto genérico.
 * Al mostrarse la carga, la URL ya es la del destino, así que `usePathname` devuelve la nueva ruta.
 */
export function RouteLoading({
  pathname: forced,
  bare = false,
}: {
  pathname?: string;
  /**
   * Sin contenedor ni animación de entrada: para usarlo como `fallback` de un Suspense que ya
   * está dentro de la página (PageShell pone el ancho y el espacio). Así la carga de la ruta y la
   * de la página son idénticas y no hay salto entre una y otra.
   */
  bare?: boolean;
}) {
  const current = usePathname();
  const meta = routeMetaFor(forced ?? current);
  if (!meta) return bare ? <LoadingRows /> : <PageLoadingSkeleton />;

  const content = (
    <>
      <span className="sr-only" role="status">
        Cargando {meta.title}…
      </span>
      <header className="flex flex-col gap-3">
        {meta.crumbs ? <Breadcrumbs crumbs={meta.crumbs} /> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{meta.title}</h1>
            {meta.description ? (
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            ) : null}
          </div>
          {meta.actions ? (
            <div aria-hidden="true" className="flex flex-wrap gap-2">
              {Array.from({ length: meta.actions }, (_, i) => (
                <Skeleton key={i} className="h-11 w-32 rounded-lg md:h-9" />
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <LoadingRows />
    </>
  );

  if (bare) return content;
  return (
    <section
      aria-busy="true"
      className={cn('loading-instant mx-auto flex w-full flex-col', meta.container)}
    >
      {content}
    </section>
  );
}

function LoadingRows() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-12 w-full" />
      ))}
    </div>
  );
}
