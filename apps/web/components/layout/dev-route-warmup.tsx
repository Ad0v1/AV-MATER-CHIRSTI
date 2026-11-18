'use client';

import { useEffect } from 'react';

/**
 * Solo en desarrollo: compila por adelantado las rutas del menú.
 *
 * `next dev` compila cada ruta la primera vez que se visita, y hasta entonces la navegación no se
 * confirma (la URL y el contenido no cambian). Aquí, poco después de entrar, se piden en segundo
 * plano esas rutas y los archivos de cliente que usan, de modo que al hacer clic ya estén listas.
 * En producción no hace nada: Next precarga las rutas por su cuenta y no hay compilación.
 */
export function DevRouteWarmup({ hrefs }: { hrefs: readonly string[] }) {
  const list = hrefs.join('|');
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let cancelled = false;
    async function warm() {
      for (const href of list.split('|')) {
        if (cancelled) return;
        if (!href || href === window.location.pathname) continue;
        try {
          const res = await fetch(href, { credentials: 'same-origin' });
          const html = await res.text();
          // Los archivos de cliente también se compilan al pedirlos.
          const chunks = new Set(html.match(/\/_next\/static\/[^"'\\s]+\.js/g) ?? []);
          await Promise.all([...chunks].slice(0, 40).map((url) => fetch(url).catch(() => null)));
        } catch {
          // Es solo una ayuda: si falla, la ruta se compila al visitarla, como siempre.
        }
      }
    }
    const timer = setTimeout(() => void warm(), 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [list]);
  return null;
}
