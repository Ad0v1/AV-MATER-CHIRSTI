import Image from 'next/image';
import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from 'cn';
import { imagenCurso } from './area';
import { cursoStyle, type CursoColor } from './colores';

/**
 * Tarjeta de curso (guia 4.2). Imagen del area arriba (sin texto encima), barra del color del
 * curso y texto debajo sobre blanco; pie segun el rol.
 * Si `href` existe, la tarjeta entera es UN enlace (titulo con ::after); si no, es informativa
 * (apoderado).
 */
export function CourseCard({
  nombre,
  seccion,
  color,
  href,
  linea,
  pie,
  prioridad = false,
  className,
}: {
  nombre: string;
  seccion: string;
  color: CursoColor;
  href?: string;
  /** Linea bajo la franja: docente del curso o "28 estudiantes". */
  linea: string;
  /** Chip o acciones del pie. */
  pie: ReactNode;
  /** Carga inmediata de la imagen (solo las dos primeras tarjetas visibles). */
  prioridad?: boolean;
  className?: string;
}) {
  const src = imagenCurso(nombre);
  const titulo = href ? (
    <Link
      href={href}
      className="rounded-sm after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-['']"
    >
      {nombre}
    </Link>
  ) : (
    nombre
  );

  return (
    <Card
      style={cursoStyle(color)}
      className={cn(
        href && 'tarjeta-curso',
        'relative h-full gap-0 overflow-hidden rounded-2xl bg-surface py-0 ring-1 ring-line',
        className,
      )}
    >
      {/* Imagen del area, sin texto encima (no necesita velo). Sin area: color plano e inicial. */}
      <div className="relative flex h-28 shrink-0 items-center justify-center bg-(--course)">
        {src ? (
          <Image
            unoptimized
            src={src}
            alt=""
            fill
            priority={prioridad}
            sizes="(min-width: 1280px) 280px, (min-width: 768px) 33vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="font-heading flex size-12 items-center justify-center rounded-full border-2 border-white/40 text-xl font-semibold text-white"
          >
            {nombre.charAt(0)}
          </span>
        )}
      </div>
      <span aria-hidden="true" className="block h-1.5 shrink-0 bg-(--course)" />
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <h3 className="font-heading line-clamp-2 text-[1.0625rem] leading-6 font-medium text-ink">
          {titulo}
        </h3>
        <p className="text-sm text-ink-2">{seccion}</p>
        <p className="text-sm text-ink-2">{linea}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">{pie}</div>
      </div>
    </Card>
  );
}

/** Chip "Al día" (estado de exito: icono + texto). */
export function AlDia({ texto = 'Al día' }: { texto?: string }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
      <CircleCheck className="size-3" aria-hidden="true" />
      {texto}
    </span>
  );
}

/** Chip soft del color del curso (pie de tarjeta). */
export function CourseChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full bg-(--course-soft) px-2.5 py-0.5 text-xs font-semibold text-ink">
      <span aria-hidden="true" className="size-2 rounded-full bg-(--course)" />
      {children}
    </span>
  );
}
