// Piezas de presentación sin estado (Server Components) de las pantallas de administración.
import Link from 'next/link';
import { Info } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { FOCUS_HEADING, PAGE_TITLE_ID } from '../lib/focus';
import type { StatusTone } from '../lib/format';
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
  crumbs?: readonly Crumb[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <Breadcrumbs crumbs={crumbs} />
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

/** Id del `<h2>` de una `Section` (destino de foco tras una acción, si es `focusable`). */
export const sectionTitleId = (id: string): string => `${id}-titulo`;

export function Section({
  title,
  description,
  children,
  id,
  focusable = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  /** El título puede recibir el foco por código (tabIndex=-1, sin entrar en el orden del Tab). */
  focusable?: boolean;
}) {
  const headingId = id ? sectionTitleId(id) : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id={headingId}
          tabIndex={focusable ? -1 : undefined}
          className={cn('text-lg font-semibold', focusable && FOCUS_HEADING)}
        >
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// Estado en una pastilla suave (fondo tenue y punto de color), sin rellenos sólidos ni contornos.
// El estado va siempre como texto; el punto solo refuerza.
const TONE_CLASS: Record<StatusTone, { pill: string; dot: string }> = {
  active: {
    pill: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
    dot: 'bg-emerald-600',
  },
  closed: {
    pill: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
    dot: 'bg-zinc-500',
  },
  inactive: {
    pill: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
    dot: 'bg-zinc-400',
  },
  future: {
    pill: 'bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100',
    dot: 'bg-sky-600',
  },
};

/** Estado como texto (no solo color). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const t = TONE_CLASS[tone];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        t.pill,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', t.dot)} />
      {children}
    </span>
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

/** Aviso fijo (por defecto, "Solo lectura" cuando el año no se puede cambiar, D-030). */
export function ReadOnlyNotice({
  children,
  title = 'Solo lectura',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
