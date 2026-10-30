'use client';

// Región de estado siempre montada para anunciar el resultado de las acciones (ux-accesibilidad,
// Decisión 4 de la entrega 5a). Un `role="status"` que se crea ya con texto no lo anuncian
// muchos lectores de pantalla; por eso el contenedor existe desde el inicio y solo cambia su
// contenido. El mensaje también se ve en pantalla un rato.
//
// Entrega 5b (hallazgo MEDIO de UX, INFORME 7):
// - La caja visible tiene un botón "Cerrar" de 44 px, fuera de la región de estado (así el
//   lector no lee "Cerrar aviso" junto al mensaje).
// - El tiempo se detiene mientras el puntero o el foco están sobre la caja (WCAG 2.2.1).
// - Mientras se ve, se reserva al final de la página un espacio de su alto: en móvil (360 px)
//   los últimos botones se pueden desplazar por encima de la caja y no quedan tapados.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { focusAfterSuccess } from '../lib/focus';

const VISIBLE_MS = 10_000;

type Announce = (message: string) => void;

const FeedbackContext = createContext<Announce>(() => {});

export function useAnnounce(): Announce {
  return useContext(FeedbackContext);
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timer.current = setTimeout(() => setMessage(''), VISIBLE_MS);
  }, [stopTimer]);

  const announce = useCallback<Announce>(
    (next) => {
      stopTimer();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Vaciar y volver a escribir: así se anuncia aunque el texto se repita.
      setMessage('');
      frame.current = requestAnimationFrame(() => {
        setMessage(next);
        startTimer();
      });
    },
    [startTimer, stopTimer],
  );

  const close = () => {
    const hadFocus = boxRef.current?.contains(document.activeElement) ?? false;
    stopTimer();
    setMessage('');
    // El botón desaparece: si tenía el foco, se lleva al título de la página (no a <body>).
    if (hadFocus) requestAnimationFrame(() => focusAfterSuccess());
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const visible = message !== '';

  return (
    <FeedbackContext value={announce}>
      {children}
      {/* Espacio reservado al final de la página mientras se ve la caja (solo móvil). */}
      {visible ? <div aria-hidden="true" className="h-28 shrink-0 sm:hidden" /> : null}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center sm:inset-x-auto sm:right-4">
        <div
          ref={boxRef}
          onMouseEnter={visible ? stopTimer : undefined}
          onMouseLeave={visible ? startTimer : undefined}
          onFocus={visible ? stopTimer : undefined}
          onBlur={visible ? startTimer : undefined}
          className={cn(
            'flex max-w-sm items-start gap-2',
            visible &&
              'pointer-events-auto rounded-lg border border-emerald-700 bg-background py-1 pr-1 pl-4 shadow-lg dark:border-emerald-400',
          )}
        >
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn(
              'text-sm text-emerald-900 dark:text-emerald-100',
              visible && 'min-w-0 flex-1 py-2.5 break-words',
            )}
          >
            {message}
          </p>
          {visible ? (
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              aria-label="Cerrar aviso"
              className="min-h-11 min-w-11 shrink-0 px-3"
            >
              Cerrar
            </Button>
          ) : null}
        </div>
      </div>
    </FeedbackContext>
  );
}
