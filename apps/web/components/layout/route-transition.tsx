'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const PUBLIC_PATHS = new Set([
  '/login',
  '/recuperar',
  '/verificar-correo',
  '/politica',
  '/cambiar-clave',
  '/mi-perfil',
  '/verificacion-dos-pasos',
]);

/** Anima el acceso público y conserva montado el shell privado al navegar entre sus módulos. */
export function RootRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const key = PUBLIC_PATHS.has(pathname) ? pathname : 'authenticated-app';

  return (
    <div key={key} className="route-enter flex min-h-full w-full flex-1 flex-col">
      {children}
    </div>
  );
}

/** Anima solo el área de página; el sidebar y su estado permanecen montados. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="route-enter min-w-0 flex-1">
      {children}
    </div>
  );
}
