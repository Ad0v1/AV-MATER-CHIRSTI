import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from 'cn';

/**
 * Banner con fotografia (guia 2.8.3, 4.3 y 4.4): fondo de reserva (--course o marca), imagen
 * decorativa (alt=""), velo brand-dark >= 65 % y contenido encima. Sin imagen se ve el color plano.
 * Movil: velo uniforme de 70 %. Desde md: degradado 72 -> 65 (al 60 %) -> 35 %.
 */
export function ImageBanner({
  src,
  posicion = 'center 40%',
  priority = false,
  barra = false,
  className,
  children,
}: {
  src: string | null;
  /** object-position; por defecto la zona segura de la guia (centro 40 %). */
  posicion?: string;
  priority?: boolean;
  /** Barra de 6 px del color del curso en el borde inferior (decorativa). */
  barra?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const estiloFondo: CSSProperties = { backgroundColor: 'var(--course, var(--brand))' };
  return (
    <div
      style={estiloFondo}
      className={cn(
        'relative isolate flex flex-col overflow-hidden rounded-2xl text-white',
        className,
      )}
    >
      {src ? (
        <>
          <Image
            unoptimized
            src={src}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1280px) 1152px, 100vw"
            style={{ objectPosition: posicion }}
            className="-z-20 object-cover"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-(--scrim-70) md:hidden" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden bg-(image:--scrim-banner) md:block"
          />
        </>
      ) : null}
      <div className="relative flex-1">{children}</div>
      {barra ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1.5 bg-(--course,var(--brand))"
        />
      ) : null}
    </div>
  );
}

/**
 * Banner de inicio (guia 4.3): 112 px en movil y 144 px desde md, UN h1 con el saludo y una
 * linea de apoyo. Usa inicio.webp.
 */
export function HomeBanner({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <ImageBanner
      src="/maqueta/img/inicio.webp"
      posicion="center 62%"
      priority
      className="h-28 md:h-36"
    >
      <div className="flex h-full flex-col justify-center gap-0.5 px-4 md:px-8">
        <h1 className="font-heading text-2xl leading-8 font-semibold md:text-[1.75rem] md:leading-9">
          {titulo}
        </h1>
        <p className="text-sm leading-5">{texto}</p>
      </div>
    </ImageBanner>
  );
}
