import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { RouteLoading } from './route-loading';

/**
 * Estructura estable para el contenido de las rutas privadas mientras llega cada página.
 * Se ve al instante al cambiar de módulo (sin espera ni parpadeo) y sigue el diseño limpio de las
 * páginas: encabezado con acciones y filas sobre el fondo, sin paneles ni bordes internos.
 */
export function PageLoadingSkeleton() {
  return (
    <section
      aria-busy="true"
      className="loading-instant mx-auto flex w-full max-w-5xl flex-col gap-8 p-4 sm:p-8"
    >
      <span className="sr-only" role="status">
        Cargando contenido de la página…
      </span>
      <header className="flex items-start justify-between gap-4">
        <div className="grid w-full max-w-xl gap-2.5">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Skeleton className="h-11 w-36 rounded-lg" />
          <Skeleton className="h-11 w-28 rounded-lg" />
        </div>
      </header>

      <div className="grid gap-3">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

/** Esqueleto de sesión: mantiene el espacio del menú lateral durante la primera validación. */
export function AppShellLoadingSkeleton() {
  return (
    <div aria-busy="true" className="loading-appear flex min-h-svh w-full">
      <span className="sr-only" role="status">
        Cargando tu aula virtual…
      </span>
      <aside
        aria-hidden="true"
        className="hidden w-64 shrink-0 flex-col justify-between bg-sidebar p-3 md:flex"
      >
        <div className="grid gap-7">
          <div className="flex items-center gap-3 px-2 pt-1">
            <Image
              src="/brand/escudo.webp"
              alt=""
              width={36}
              height={44}
              className="h-11 w-9 object-contain"
            />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-28 bg-white/15" />
              <Skeleton className="h-3 w-20 bg-white/10" />
            </div>
          </div>
          <div className="grid gap-2 px-1">
            <Skeleton className="mb-1 ml-2 h-3 w-24 bg-white/10" />
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-10 w-full rounded-xl bg-white/10" />
            ))}
          </div>
        </div>
        <Skeleton className="mx-1 h-11 rounded-xl bg-white/10" />
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex h-12 items-center border-b border-line bg-surface px-4">
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <RouteLoading />
      </main>
    </div>
  );
}

/** Esqueleto de las rutas públicas de acceso y recuperación. */
export function AuthPageLoadingSkeleton() {
  return (
    <main aria-busy="true" className="grid min-h-dvh place-items-center px-4 py-10 sm:px-8">
      <span className="sr-only" role="status">
        Cargando formulario…
      </span>
      <section className="grid w-full max-w-sm gap-5 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </section>
    </main>
  );
}
