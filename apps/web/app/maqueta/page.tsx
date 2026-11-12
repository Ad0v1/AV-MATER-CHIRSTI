import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const PANTALLAS = [
  {
    href: '/maqueta/login',
    titulo: 'Inicio de sesión',
    texto:
      'Foto del colegio con velo, escudo, lema y tarjeta con código de usuario y contraseña. Sin menú.',
  },
  {
    href: '/maqueta/inicio/estudiante',
    titulo: 'Inicio del estudiante',
    texto: 'Banner con foto, pendientes primero, avisos y tarjetas de curso con imagen.',
  },
  {
    href: '/maqueta/inicio/docente',
    titulo: 'Inicio del docente',
    texto: 'Por calificar, próximos plazos de mis tareas y mis cursos.',
  },
  {
    href: '/maqueta/inicio/apoderado',
    titulo: 'Inicio del apoderado',
    texto: 'Selector de hijo, esta semana, notas recientes y avisos. Solo consulta.',
  },
  {
    href: '/maqueta/curso',
    titulo: 'Curso por dentro',
    texto: 'Cabecera con la imagen del área y pestañas: Clases, Lecturas, Tareas y Avisos.',
  },
];

export default function MaquetaIndice() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-[1.375rem] leading-[1.875rem] font-semibold text-brand md:text-2xl md:leading-8">
          Maqueta del Aula Virtual
        </h1>
        <p className="text-base text-ink-2">
          Pantallas estáticas con datos de ejemplo. Cambia el ancho de la ventana (360, 768 y 1280
          px) para ver la barra inferior en el móvil y el menú marrón en el escritorio.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {PANTALLAS.map((p) => (
          <li
            key={p.href}
            className="relative flex flex-col gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line transition-colors hover:bg-row-hover"
          >
            <h2 className="font-heading text-lg leading-[1.625rem] font-semibold text-ink">
              <Link
                href={p.href}
                className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-['']"
              >
                {p.titulo}
              </Link>
            </h2>
            <p className="text-base text-ink-2">{p.texto}</p>
            <span
              aria-hidden="true"
              className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand"
            >
              Abrir <ArrowRight className="size-4" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
