'use client';

// Campana de avisos (RF-53, Dev 5) en la cabecera de (app). Muestra el contador de no leídas y,
// al abrirla, un panel lateral con la lista (texto plano armado por la API). Abrir un aviso lo
// marca como leído. Accesibilidad: botón con nombre que incluye el contador, panel con foco
// atrapado (Escape cierra), objetivos de 44 px y región de estado para los resultados.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
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
        <SheetTrigger
          render={<Button variant="ghost" className="relative min-h-11 min-w-11" />}
          aria-label={label.aria}
        >
          <Bell aria-hidden="true" />
          {label.badge ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 min-w-5 rounded-full bg-danger px-1 text-center text-[0.7rem] leading-5 font-semibold text-white ring-2 ring-background"
            >
              {label.badge}
            </span>
          ) : null}
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-full overflow-y-auto sm:max-w-sm"
        >
          <SheetHeader className="flex-row items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-base font-semibold">Avisos</SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {unread > 0 ? `${unread} sin leer` : 'No tienes avisos sin leer'}
              </SheetDescription>
            </div>
            <SheetClose render={<Button variant="outline" className="min-h-11 px-4" />}>
              Cerrar
            </SheetClose>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {unread > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 self-start px-4"
                onClick={markAll}
                aria-disabled={pending || undefined}
              >
                Marcar todos como leídos
              </Button>
            ) : null}
            <div role="status" aria-live="polite" className="text-sm">
              {status}
            </div>
            <div role="alert" className={error ? 'text-sm text-destructive' : undefined}>
              {error ? <p>{error}</p> : null}
            </div>

            {!page ? (
              <p className="text-sm text-muted-foreground">Cargando avisos…</p>
            ) : page.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tienes avisos.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {page.items.map((n) => {
                  const href = notificationHref(n, role);
                  const body = (
                    <>
                      <span className="flex items-start gap-2">
                        {n.readAt ? null : (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <span className={`break-words ${n.readAt ? '' : 'font-medium'}`}>
                          {n.readAt ? '' : <span className="sr-only">Sin leer: </span>}
                          {n.message}
                        </span>
                      </span>
                      <time
                        dateTime={n.createdAt}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {formatWhen(n.createdAt)}
                      </time>
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {href ? (
                        <Link
                          href={href}
                          className="block min-h-11 p-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            markOne(n);
                            setOpen(false);
                          }}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="p-3 text-sm">
                          {body}
                          {n.readAt ? null : (
                            <Button
                              type="button"
                              variant="link"
                              className="mt-1 min-h-11 px-0"
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
              <nav aria-label="Páginas de avisos" className="flex items-center gap-2 text-sm">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4"
                  disabled={page.page <= 1}
                  onClick={() => void load(page.page - 1)}
                >
                  Anterior
                </Button>
                <span>
                  {page.page} de {pages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4"
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
