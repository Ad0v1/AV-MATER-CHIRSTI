'use client';

// Región de estado de la lista de anuncios (RF-32, UX INFORME 16). Sigue montada aunque el anuncio
// desaparezca tras retirarlo: anuncia el resultado y recibe el foco para que no se pierda.
import { useEffect, useRef, useState } from 'react';

export const ANNOUNCEMENT_STATUS_EVENT = 'announcement-status';

/** Publica un resultado para la región de estado. `focus`: llevarle el foco. */
export function announceListStatus(message: string, focus: boolean): void {
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_STATUS_EVENT, { detail: { message, focus } }));
}

export function ListStatus() {
  const ref = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; focus: boolean }>).detail;
      setMessage(detail.message);
      if (detail.focus) requestAnimationFrame(() => ref.current?.focus());
    };
    window.addEventListener(ANNOUNCEMENT_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ANNOUNCEMENT_STATUS_EVENT, onStatus);
  }, []);
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className="rounded-md text-sm outline-none focus:ring-2 focus:ring-ring/60"
    >
      {message}
    </div>
  );
}
