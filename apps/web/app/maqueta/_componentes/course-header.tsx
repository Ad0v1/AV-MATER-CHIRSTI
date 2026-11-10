import type { ReactNode } from 'react';
import { cn } from 'cn';
import { cursoStyle, type CursoColor } from './colores';
import { imagenCurso } from './area';
import { ImageBanner } from './image-banner';

/**
 * Cabecera de curso (guia 4.4): banner con la imagen del area (1600x400, object-cover), velo
 * brand-dark >= 65 %, UN h1 y metadatos en blanco, barra de 6 px del color del curso. Sin area:
 * color plano con la inicial en circulo.
 */
export function CourseHeader({
  nombre,
  meta,
  color,
  accion,
  className,
}: {
  nombre: string;
  meta: string;
  color: CursoColor;
  accion?: ReactNode;
  className?: string;
}) {
  const src = imagenCurso(nombre);
  return (
    <div style={cursoStyle(color)} className={cn('contents')}>
      <ImageBanner src={src} barra priority className={cn('min-h-32 md:min-h-42', className)}>
        <header className="flex h-full min-h-32 flex-col justify-center gap-3 px-4 pt-4 pb-5 md:min-h-42 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3 md:max-w-[60%] md:gap-4">
            {src ? null : (
              <span
                aria-hidden="true"
                className="font-heading flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-white/40 text-xl font-semibold md:size-14"
              >
                {nombre.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="font-heading text-[1.375rem] leading-[1.875rem] font-semibold md:text-2xl md:leading-8">
                {nombre}
              </h1>
              <p className="text-sm leading-5">{meta}</p>
            </div>
          </div>
          {accion ? <div>{accion}</div> : null}
        </header>
      </ImageBanner>
    </div>
  );
}
