'use client';

// Carrusel de fotos del colegio en el login (skill motion-design, arquetipo Corporate).
// El panel es más alto que ancho, así que una foto horizontal no cabe entera: cada foto se
// desplaza despacio de izquierda a derecha (ease-in-out) para mostrarla completa, y al terminar
// pasa a la siguiente con un fundido cruzado de 700 ms. La fachada queda fija, centrada.
// - Empieza solo al cargar y no tiene botón de pausa (decisión del usuario, 10/11/2026; queda
//   fuera de WCAG 2.2.2). Con reduced motion no avanza ni se desplaza.
// - Con prefers-reduced-motion no avanza solo ni se desplaza: queda cada foto centrada.
// Solo fotos del colegio (decisión del usuario, 10/11/2026), en public/brand/colegio/.
import Image, { type StaticImageData } from 'next/image';
import { useEffect, useState, type CSSProperties } from 'react';
import fachada from '../../assets/fondo_login_av.webp';

type Slide = {
  src: StaticImageData | string;
  /** Recorrido horizontal: la foto se desplaza para verse entera. */
  pan: boolean;
  /** Tiempo en pantalla, incluido el desplazamiento. */
  ms: number;
  /** Encuadre vertical. */
  y: string;
};

const SLIDES: Slide[] = [
  { src: fachada, pan: false, ms: 3500, y: '46%' },
  { src: '/brand/colegio/patio-evento.webp', pan: true, ms: 7000, y: '50%' },
  { src: '/brand/colegio/premiacion.webp', pan: true, ms: 7000, y: '45%' },
  { src: '/brand/colegio/docentes.webp', pan: true, ms: 6500, y: '40%' },
  { src: '/brand/colegio/jardin.webp', pan: true, ms: 6000, y: '50%' },
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function LoginCarousel() {
  const [index, setIndex] = useState(0);
  const many = SLIDES.length > 1;

  useEffect(() => {
    if (!many || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDES[index]!.ms);
    return () => window.clearTimeout(t);
  }, [index, many]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {SLIDES.map((s, i) => (
        <div
          key={typeof s.src === 'string' ? s.src : 'fachada'}
          aria-hidden="true"
          className="login-slide absolute inset-0"
          data-active={i === index ? '' : undefined}
          data-pan={s.pan ? '' : undefined}
          style={{ '--pan-ms': `${s.ms}ms`, '--pan-y': s.y } as CSSProperties}
        >
          <Image
            src={s.src}
            alt=""
            fill
            priority={i === 0}
            unoptimized={typeof s.src === 'string'}
            sizes="(min-width: 1024px) 54vw, 100vw"
            className="login-slide-img object-cover"
          />
        </div>
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/15 to-brand-dark/90"
      />
      {many && (
        <div className="absolute right-5 bottom-5 lg:right-12 lg:bottom-10">
          <div className="flex gap-1.5" aria-hidden="true">
            {SLIDES.map((s, i) => (
              <span
                key={i}
                className="login-dot h-1.5 rounded-full bg-white/50"
                data-active={i === index ? '' : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
