// Piezas de presentación sin estado (Server Components) de /admin/estructura.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { FOCUS_HEADING, PAGE_TITLE_ID } from '../_lib/focus';
import type { StatusTone } from '../_lib/format';
import { ActionFeedbackProvider } from './action-feedback';

// <div>, no <main>: el <main> ya lo pone SidebarInset en el layout (no se toca el layout).
// Envuelve el contenido con la región de estado de las acciones (ActionFeedbackProvider).
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <ActionFeedbackProvider>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">{children}</div>
    </ActionFeedbackProvider>
  );
}

export type Crumb = { href?: string; label: string };

export function PageHeader({
  title,
  description,
  crumbs = [],
  actions,
}: {
  title: string;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {crumbs.length > 0 ? (
        <nav aria-label="Ruta de navegación">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {c.href ? (
                  <Link
                    href={c.href}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
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
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            id={PAGE_TITLE_ID}
            tabIndex={-1}
            className={cn('text-2xl font-semibold', FOCUS_HEADING)}
          >
            {title}
          </h1>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-titulo` : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const TONE_CLASS: Record<StatusTone, string> = {
  active: 'border-transparent bg-emerald-700 text-white',
  closed: 'border-transparent bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-950',
  inactive: 'border-zinc-400 text-zinc-800 dark:text-zinc-200',
  future: 'border-sky-700 text-sky-900 dark:border-sky-400 dark:text-sky-100',
};

/** Estado como texto (no solo color). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge variant="outline" className={cn('h-6 px-2.5 text-xs', TONE_CLASS[tone])}>
      {children}
    </Badge>
  );
}

/** Error al cargar datos: mensaje en español según el status (toUserMessage). */
export function LoadError({ error, backHref }: { error: unknown; backHref?: string }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <Alert variant="destructive">
      <AlertTitle>{notFound ? 'No encontrado' : 'No se pudo cargar la información'}</AlertTitle>
      <AlertDescription>
        <p className="break-words">{toUserMessage(error)}</p>
        {backHref ? (
          <p className="mt-2">
            <Link href={backHref} className="underline underline-offset-4">
              Volver
            </Link>
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** Esqueleto mientras llega lo dinámico (va como fallback de Suspense). */
export function LoadingBlock({ rows = 3, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Aviso fijo cuando el año es de solo lectura (D-030). */
export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <Alert role="note">
      <AlertTitle>Solo lectura</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
