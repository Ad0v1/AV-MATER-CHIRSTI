'use client';

// Campana de avisos (RF-53, Dev 5) en la cabecera de (app). Muestra el contador de no leídas y,
// al abrirla, un panel lateral con la lista (texto plano armado por la API). Abrir un aviso lo
// marca como leído. Accesibilidad: botón con nombre que incluye el contador, panel con foco
// atrapado (Escape cierra), objetivos de 44 px y región de estado para los resultados.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Role } from '@/lib/roles';
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type LoadResult,
} from './actions';
import {
  formatWhen,
  notificationHref,
  unreadLabel,
  type NotificationItem,
  type NotificationPage,
} from './notifications';

/** Cada 2 minutos se actualiza el contador mientras la pestaña está visible. */
const POLL_MS = 120_000;

export function NotificationBell({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // Anuncio para lectores de pantalla solo cuando el contador sube (no en la carga inicial).
  const [liveText, setLiveText] = useState('');
  const lastUnread = useRef<number | null>(null);
  const [pending, start] = useTransition();

  const apply = useCallback((res: LoadResult) => {
    if (res.ok) {
      setPage(res.page);
      const prev = lastUnread.current;
      if (prev !== null && res.page.unreadCount > prev) {
        const c = res.page.unreadCount;
        setLiveText(`Tienes ${c} ${c === 1 ? 'aviso' : 'avisos'} sin leer`);
      }
      lastUnread.current = res.page.unreadCount;
      setError(null);
    } else {
      setError(res.message);
    }
  }, []);

  const load = useCallback(
    async (n = 1) => {
      apply(await loadNotifications(n));
    },
    [apply],
  );

  // Carga inicial y sondeo del contador (solo con la pestaña visible).
  useEffect(() => {
    let alive = true;
    const refreshCount = () => {
      void loadNotifications(1).then((res) => {
        if (alive) apply(res);
      });
    };
    refreshCount();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshCount();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [apply]);

  const unread = page?.unreadCount ?? 0;
  const label = unreadLabel(unread);

  function markOne(item: NotificationItem) {
    if (item.readAt) return;
    start(async () => {
      const res = await markNotificationRead(item.id);
      if (res.ok) await load(page?.page ?? 1);
      else setError(res.message);
    });
  }

  function markAll() {
    if (pending) return;
    start(async () => {
      const res = await markAllNotificationsRead();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await load(page?.page ?? 1);
      setStatus('Todos los avisos quedaron como leídos.');
    });
  }

  const pages = page ? Math.max(1, Math.ceil(page.total / Math.max(1, page.pageSize))) : 1;

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {liveText}
      </span>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setStatus('');
          if (next) void load(1);
        }}
      >
        {/* Botón compacto: 36 px y circular, para que el resalte al pasar el cursor sea discreto. */}
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              className="relative size-11 min-h-11 min-w-11 rounded-full md:size-9 md:min-h-9 md:min-w-9 p-0 text-ink-2 hover:bg-foreground/5 hover:text-foreground"
            />
          }
          aria-label={label.aria}
        >
          <Bell className="size-5" aria-hidden="true" />
          {label.badge ? (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6875rem] leading-none font-semibold text-white tabular-nums ring-2 ring-surface"
            >
              {label.badge}
            </span>
          ) : null}
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-full gap-0 overflow-y-auto sm:max-w-sm"
        >
          <SheetHeader className="flex-row items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <SheetTitle className="text-lg font-semibold">Avisos</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {unread > 0 ? `${unread} sin leer` : 'Estás al día'}
              </SheetDescription>
            </div>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  aria-label="Cerrar avisos"
                  className="-mr-2 size-9 min-h-9 min-w-9 rounded-full p-0 text-ink-2 hover:bg-foreground/5"
                />
              }
            >
              <X className="size-5" aria-hidden="true" />
            </SheetClose>
          </SheetHeader>

          <div className="flex flex-col px-2 pb-4">
            {unread > 0 ? (
              <div className="flex justify-end px-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-2 text-sm font-medium text-brand hover:bg-brand-soft"
                  onClick={markAll}
                  aria-disabled={pending || undefined}
                >
                  Marcar todos como leídos
                </Button>
              </div>
            ) : null}
            <div role="status" aria-live="polite" className="px-3 text-sm text-muted-foreground">
              {status}
            </div>
            <div role="alert" className={error ? 'px-3 text-sm text-destructive' : undefined}>
              {error ? <p>{error}</p> : null}
            </div>

            {!page ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">Cargando avisos…</p>
            ) : page.items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
                  <Bell className="size-6" aria-hidden="true" />
                </span>
                <p className="mt-4 text-base font-semibold">No tienes avisos</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aquí aparecerán los avisos del colegio.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col py-1">
                {page.items.map((n) => {
                  const href = notificationHref(n, role);
                  const body = (
                    <>
                      <span className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={`mt-2 size-2 shrink-0 rounded-full ${
                            n.readAt ? 'bg-transparent' : 'bg-brand'
                          }`}
                        />
                        <span
                          className={`break-words ${
                            n.readAt ? 'text-muted-foreground' : 'font-medium text-foreground'
                          }`}
                        >
                          {n.readAt ? '' : <span className="sr-only">Sin leer: </span>}
                          {n.message}
                        </span>
                      </span>
                      <time
                        dateTime={n.createdAt}
                        className="mt-1 block pl-[1.125rem] text-xs text-muted-foreground"
                      >
                        {formatWhen(n.createdAt)}
                      </time>
                    </>
                  );
                  return (
                    <li key={n.id} className="border-b border-line/60 last:border-b-0">
                      {href ? (
                        <Link
                          href={href}
                          className="block rounded-lg px-3 py-3 text-sm transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-active motion-reduce:transition-none"
                          onClick={() => {
                            markOne(n);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-3 py-3 text-sm">
                          {body}
                          {n.readAt ? null : (
                            <Button
                              type="button"
                              variant="link"
                              className="mt-1 h-9 pr-0 pl-[1.125rem] text-brand"
                              onClick={() => markOne(n)}
                              aria-label={`Marcar como leído: ${n.message.slice(0, 60)}`}
                            >
                              Marcar como leído
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {page && pages > 1 ? (
              <nav
                aria-label="Páginas de avisos"
                className="mt-2 flex items-center justify-between gap-2 px-3 text-sm"
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3"
                  disabled={page.page <= 1}
                  onClick={() => void load(page.page - 1)}
                >
                  Anterior
                </Button>
                <span className="text-muted-foreground tabular-nums">
                  {page.page} de {pages}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3"
                  disabled={page.page >= pages}
                  onClick={() => void load(page.page + 1)}
                >
                  Siguiente
                </Button>
              </nav>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
