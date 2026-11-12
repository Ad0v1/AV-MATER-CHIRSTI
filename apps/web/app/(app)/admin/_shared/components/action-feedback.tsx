'use client';

// Avisos de resultado de las acciones, mostrados como toast de SweetAlert2.
// Misma posición que antes: abajo a la derecha (en móvil, abajo y centrado).
// SweetAlert2 crea su contenedor con role="alert"/aria-live, así que el lector de pantalla
// lo anuncia. El tiempo se detiene mientras el puntero está sobre el toast (WCAG 2.2.1)
// y tiene botón de cierre.
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import Swal from 'sweetalert2';

const VISIBLE_MS = 10_000;

type Announce = (message: string) => void;

const FeedbackContext = createContext<Announce>(() => {});

export function useAnnounce(): Announce {
  return useContext(FeedbackContext);
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const announce = useCallback<Announce>((message) => {
    if (!message) return;
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    void Swal.fire({
      toast: true,
      position: mobile ? 'bottom' : 'bottom-end',
      icon: 'success',
      title: message,
      showConfirmButton: false,
      showCloseButton: true,
      closeButtonHtml: '&times;',
      timer: VISIBLE_MS,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });
  }, []);

  // Al salir de la página no queda un toast abierto.
  useEffect(() => () => Swal.close(), []);

  return <FeedbackContext value={announce}>{children}</FeedbackContext>;
}
