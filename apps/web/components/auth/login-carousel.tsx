'use client';

// Carrusel de fotos del colegio en el login (motion-design, arquetipo Corporate).
// - Capa primaria: fundido cruzado de 700 ms ease-in-out cada 7 s (cambio en pantalla).
// - Capa ambiente: acercamiento lento de 1 a 1,04 mientras la foto está visible.
// - Accesible: se pausa al pasar el mouse o con el foco, tiene botón de pausa (WCAG 2.2.2) y
//   con prefers-reduced-motion no avanza solo ni hace zoom.
// Para agregar fotos del colegio, súmalas a SLIDES (webp, sin rostros identificables de menores).
import Image, { type StaticImageData } from 'next/image';
import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import fachada from '../../assets/fondo_login_av.webp';

type Slide = { src: StaticImageData | string; position: string };

const SLIDES: Slide[] = [
  { src: fachada, position: 'center 46%' },
  { src: '/brand/login-aula.webp', position: 'center 55%' },
];

const INTERVAL_MS = 7000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function LoginCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const many = SLIDES.length > 1;

  useEffect(() => {
    if (!many || paused || hovered || prefersReducedMotion()) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, hovered, many]);

  return (
    <div
      className="absolute inset-0 -z-10 overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {SLIDES.map((s, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="login-slide absolute inset-0"
          data-active={i === index ? '' : undefined}
        >
          <Image
            src={s.src}
            alt=""
            fill
            priority={i === 0}
            unoptimized={typeof s.src === 'string'}
            sizes="(min-width: 1024px) 54vw, 100vw"
            className="login-slide-img object-cover"
            style={{ objectPosition: s.position }}
          />
        </div>
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/15 to-brand-dark/90"
      />
      {many && (
        <div className="absolute right-5 bottom-5 flex items-center gap-2 lg:right-12 lg:bottom-10">
          <div className="flex gap-1.5" aria-hidden="true">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className="login-dot h-1.5 rounded-full bg-white/50"
                data-active={i === index ? '' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Reanudar fotos del colegio' : 'Pausar fotos del colegio'}
            aria-pressed={paused}
            className="grid size-9 place-items-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
