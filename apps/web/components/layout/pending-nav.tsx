'use client';

// Respuesta inmediata al cambiar de módulo desde el menú. El `loading.tsx` de Next solo aparece
// cuando el servidor ya respondió (en desarrollo, tras compilar la ruta), y mientras tanto se
// queda la página anterior sin cambios. Aquí se reacciona al clic en el navegador: apenas el
// enlace queda "pendiente", el área de contenido pasa al título real del destino (lib/route-meta)
// con el contenido en skeleton, y se vuelve a la página en cuanto la navegación termina.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { routeMetaFor } from '@/lib/route-meta';
import { RouteLoading } from './route-loading';

type PendingNav = {
  pendingHref: string | null;
  setPending: (href: string, pending: boolean) => void;
};

const PendingNavContext = createContext<PendingNav>({
  pendingHref: null,
  setPending: () => {},
});

type Pending = { href: string; from: string };

export function PendingNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPendingState] = useState<Pending | null>(null);

  // Al cambiar la ruta la navegación ya se confirmó: se descarta el pendiente (se ajusta durante
  // el render, el patrón de React para derivar estado, en vez de un efecto).
  if (pending && pending.from !== pathname) setPendingState(null);

  const setPending = useCallback((href: string, isPending: boolean) => {
    setPendingState((current) => {
      if (isPending) return { href, from: window.location.pathname };
      // Solo se limpia si el pendiente sigue siendo este enlace (otro clic puede haberlo cambiado).
      return current?.href === href ? null : current;
    });
  }, []);

  // Cualquier enlace interno a una pantalla conocida (no solo los del menú): al hacer clic se
  // muestra al instante su título. Respeta clics con teclas (nueva pestaña), target y descargas.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname || !routeMetaFor(url.pathname)) return;
      setPending(url.pathname, true);
      // Red de seguridad: si la navegación nunca ocurre, no se queda el skeleton para siempre.
      clearTimeout(timer);
      timer = setTimeout(() => setPending(url.pathname, false), 15_000);
    }
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      clearTimeout(timer);
    };
  }, [setPending]);

  const pendingHref = pending?.href ?? null;
  const value = useMemo(() => ({ pendingHref, setPending }), [pendingHref, setPending]);
  return <PendingNavContext.Provider value={value}>{children}</PendingNavContext.Provider>;
}

/** Destino de la navegación en curso (o null): el menú lo usa para resaltar al instante. */
export function usePendingHref(): string | null {
  return useContext(PendingNavContext).pendingHref;
}

/** Va dentro de un <Link>: informa al contexto mientras ese enlace está navegando. */
export function NavPendingReporter({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  const { setPending } = useContext(PendingNavContext);
  useEffect(() => {
    setPending(href, pending);
  }, [href, pending, setPending]);
  useEffect(() => () => setPending(href, false), [href, setPending]);
  return null;
}

/** Muestra el título y el skeleton del destino mientras su enlace está pendiente. */
export function PendingContent({ children }: { children: ReactNode }) {
  const { pendingHref } = useContext(PendingNavContext);
  const pathname = usePathname();
  if (pendingHref && pendingHref !== pathname && routeMetaFor(pendingHref)) {
    return <RouteLoading pathname={pendingHref} />;
  }
  return children;
}
