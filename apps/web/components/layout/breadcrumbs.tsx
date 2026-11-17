import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { RouteCrumb } from '@/lib/route-meta';

/**
 * Ruta de navegación con "Volver" al nivel anterior (el último paso que tiene enlace).
 * Sin estado ni 'use client': lo usan el encabezado de las páginas y el estado de carga, así se
 * ven idénticos y no hay saltos al llegar el contenido.
 */
export function Breadcrumbs({ crumbs }: { crumbs: readonly RouteCrumb[] }) {
  if (crumbs.length === 0) return null;
  const backHref = [...crumbs].reverse().find((c) => c.href)?.href;
  return (
    <nav aria-label="Ruta de navegación" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {backHref ? (
        <>
          <Link
            href={backHref}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active md:min-h-9"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-line" />
        </>
      ) : null}
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {c.href ? (
              <Link href={c.href} className="underline underline-offset-4 hover:text-foreground">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
            {i < crumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
