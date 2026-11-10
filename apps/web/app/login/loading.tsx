import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-1"
    >
      <span className="sr-only" role="status">
        Cargando inicio de sesión…
      </span>
      <aside
        aria-hidden="true"
        className="relative hidden min-h-0 flex-col justify-between overflow-hidden bg-brand px-12 py-10 lg:flex"
      >
        <Image
          src="/brand/escudo.webp"
          alt=""
          width={60}
          height={72}
          className="h-16 w-14 object-contain"
        />
        <div className="grid max-w-lg gap-3">
          <Skeleton className="h-10 w-4/5 bg-white/15" />
          <Skeleton className="h-10 w-3/5 bg-white/15" />
          <Skeleton className="mt-2 h-5 w-4/5 bg-white/10" />
        </div>
      </aside>
      <section className="flex min-h-0 flex-col overflow-y-auto px-5 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-10">
        <div className="my-auto grid w-full max-w-md gap-6 self-center">
          <div className="flex items-center gap-3 lg:hidden">
            <Image
              src="/brand/escudo.webp"
              alt=""
              width={48}
              height={56}
              className="h-12 w-10 object-contain"
            />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="grid gap-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-64 max-w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
          <div className="grid gap-4">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </section>
    </main>
  );
}
