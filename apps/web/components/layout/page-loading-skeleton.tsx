import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

/** Estructura estable para el contenido de las rutas privadas mientras llega cada página. */
export function PageLoadingSkeleton() {
  return (
    <section aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <span className="sr-only" role="status">
        Cargando contenido de la página…
      </span>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid w-full max-w-xl gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-3/4 max-w-sm" />
        </div>
        <Skeleton className="h-10 w-36 max-w-full rounded-lg" />
      </header>

      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:gap-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-6 w-40 max-w-full" />
          <Skeleton className="h-9 w-32 max-w-full rounded-lg" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="grid gap-2 pt-1">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Esqueleto de sesión: mantiene el espacio del menú lateral durante la primera validación. */
export function AppShellLoadingSkeleton() {
  return (
    <div aria-busy="true" className="flex min-h-svh w-full bg-background">
      <span className="sr-only" role="status">
        Cargando tu aula virtual…
      </span>
      <aside
        aria-hidden="true"
        className="hidden w-64 shrink-0 flex-col gap-7 bg-sidebar p-4 md:flex"
      >
        <div className="flex items-center gap-3 border-b border-sidebar-border px-2 pb-4">
          <Image
            src="/brand/escudo.webp"
            alt=""
            width={36}
            height={44}
            className="h-11 w-9 object-contain"
          />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-28 bg-white/15" />
            <Skeleton className="h-3 w-36 bg-white/10" />
          </div>
        </div>
        <div className="grid gap-3 px-2">
          <Skeleton className="mb-1 h-3 w-24 bg-white/10" />
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10 w-full rounded-lg bg-white/10" />
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex h-12 items-center border-b border-line px-4">
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <PageLoadingSkeleton />
      </main>
    </div>
  );
}

/** Esqueleto de las rutas públicas de acceso y recuperación. */
export function AuthPageLoadingSkeleton() {
  return (
    <main
      aria-busy="true"
      className="grid min-h-dvh place-items-center bg-canvas px-4 py-10 sm:px-8"
    >
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
