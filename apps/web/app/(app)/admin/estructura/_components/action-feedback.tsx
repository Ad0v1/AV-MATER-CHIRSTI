'use client';

// Región de estado siempre montada para anunciar el resultado de las acciones (ux-accesibilidad,
// Decisión 4 de la entrega 5a). Un `role="status"` que se crea ya con texto no lo anuncian
// muchos lectores de pantalla; por eso el contenedor existe desde el inicio y solo cambia su
// contenido. El mensaje también se ve en pantalla un rato.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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

  const announce = useCallback<Announce>((next) => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    // Vaciar y volver a escribir: así se anuncia aunque el texto se repita.
    setMessage('');
    frame.current = requestAnimationFrame(() => {
      setMessage(next);
      timer.current = setTimeout(() => setMessage(''), VISIBLE_MS);
    });
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <FeedbackContext value={announce}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center sm:inset-x-auto sm:right-4"
      >
        {message ? (
          <p className="pointer-events-auto max-w-sm rounded-lg border border-emerald-700 bg-background px-4 py-3 text-sm text-emerald-900 shadow-lg dark:border-emerald-400 dark:text-emerald-100">
            {message}
          </p>
        ) : null}
      </div>
    </FeedbackContext>
  );
}
