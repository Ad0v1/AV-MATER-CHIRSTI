'use client';

// Nota "Cuenta creada" tras el alta (ALTO de UX, INFORME 13). Llega por una redirección con
// `?alta=1`, así que al montarse:
// - anuncia el resultado en la región de estado siempre montada (4.1.3);
// - lleva el foco a la nota (2.4.3): quien usa teclado o lector empieza en el resultado;
// - quita `?alta=1` de la URL con `history.replaceState`, que Next sincroniza con su router sin
//   volver a pedir la página: la nota sigue visible y el anuncio no se corta. Al recargar o tras
//   otra acción (refresh), la página ya no la muestra.
import { useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { CREATED_NOTICE_ID, createdNoticeText, withoutCreatedFlag } from '../_lib/users';

export function CreatedNotice({ detail }: { detail: string }) {
  const announce = useAnnounce();
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    // Una sola vez (en desarrollo, StrictMode monta dos veces).
    if (done.current) return;
    done.current = true;
    announce(createdNoticeText(detail));
    ref.current?.focus();
    const next = withoutCreatedFlag(window.location.pathname, window.location.search);
    if (next !== null) window.history.replaceState(window.history.state, '', next);
  }, [announce, detail]);

  return (
    <Alert
      ref={ref}
      id={CREATED_NOTICE_ID}
      role="note"
      aria-labelledby={`${CREATED_NOTICE_ID}-titulo`}
      aria-describedby={`${CREATED_NOTICE_ID}-texto`}
      tabIndex={-1}
      // Recibe el foco por código: indicador visible siempre.
      className="scroll-mt-4 border-emerald-700 outline-none focus:ring-3 focus:ring-ring/60 dark:border-emerald-400"
    >
      <AlertTitle id={`${CREATED_NOTICE_ID}-titulo`}>Cuenta creada</AlertTitle>
      <AlertDescription id={`${CREATED_NOTICE_ID}-texto`}>{detail}</AlertDescription>
    </Alert>
  );
}
