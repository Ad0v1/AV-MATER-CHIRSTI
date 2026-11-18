'use client';

import { useSyncExternalStore } from 'react';

// Saludo y fecha dependen de la hora actual, un valor que cambia entre renders. Se calculan en el
// cliente (Next no permite `new Date()` al prerenderizar en el servidor). En el servidor se muestra
// un texto neutro y, ya en el navegador, el saludo y la fecha reales de Lima.
const ZONA = 'America/Lima';

const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => 0;

function useNow(): Date | null {
  const minute = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  return minute === 0 ? null : new Date(minute * 60_000);
}

// Antes de conocer la hora se reserva el mismo espacio con un texto invisible, para que el título
// no cambie ni salte al aparecer el saludo.
export function Saludo({ nombre }: { nombre: string | null }) {
  const now = useNow();
  let saludo = 'Buenas tardes';
  if (now) {
    const hora = Number(
      new Intl.DateTimeFormat('es-PE', { hour: 'numeric', hour12: false, timeZone: ZONA }).format(
        now,
      ),
    );
    saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  }
  return (
    <span className={now ? undefined : 'invisible'}>
      {saludo}
      {nombre ? `, ${nombre}` : ''}
    </span>
  );
}

export function FechaHoy() {
  const now = useNow();
  if (!now) return <span className="inline-block h-4 w-32" aria-hidden="true" />;
  const texto = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ZONA,
  }).format(now);
  return <>{texto.charAt(0).toUpperCase() + texto.slice(1)}</>;
}
