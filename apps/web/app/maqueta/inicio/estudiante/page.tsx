import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { AnnouncementBanner } from '../../_componentes/announcement-banner';
import { cursoStyle, type CursoColor } from '../../_componentes/colores';
import { AlDia, CourseCard, CourseChip } from '../../_componentes/course-card';
import { EmptyState } from '../../_componentes/empty-state';
import { HomeBanner } from '../../_componentes/image-banner';
import type { Urgencia } from '../../_componentes/status-chip';
import { TaskRow } from '../../_componentes/task-row';

// Datos ficticios.
const TAREAS: {
  titulo: string;
  curso: string;
  color: CursoColor;
  plazo: string;
  urgencia?: Urgencia;
  grupo: string;
}[] = [
  {
    titulo: 'Práctica de fracciones',
    curso: 'Matemática · 3.° Primaria · A',
    color: 'terracota',
    plazo: 'Ayer, 11:59 p. m.',
    urgencia: 'vencida',
    grupo: 'Vencidas',
  },
  {
    titulo: 'Resumen del cuento «El zorro y el cóndor»',
    curso: 'Comunicación · 3.° Primaria · A',
    color: 'azul',
    plazo: 'Hoy, 11:59 p. m.',
    urgencia: 'hoy',
    grupo: 'Hoy',
  },
  {
    titulo: 'Informe del experimento de plantas',
    curso: 'Ciencia y Tecnología · 3.° Primaria · A',
    color: 'bosque',
    plazo: 'Mañana, 11:59 p. m.',
    urgencia: 'manana',
    grupo: 'Esta semana',
  },
  {
    titulo: 'Línea de tiempo de la Independencia',
    curso: 'Personal Social · 3.° Primaria · A',
    color: 'ciruela',
    plazo: 'Vie 14 nov, 11:59 p. m.',
    grupo: 'Esta semana',
  },
];

const AVISOS = [
  {
    curso: 'Matemática',
    color: 'terracota' as const,
    fecha: 'Hoy',
    texto: 'La prueba escrita del jueves se mueve al viernes. Traigan su calculadora.',
    nuevo: true,
  },
  {
    curso: 'Colegio',
    color: 'cacao' as const,
    fecha: 'Ayer',
    texto: 'Recuerden traer el uniforme de gala para la ceremonia del lunes.',
    nuevo: true,
  },
  {
    curso: 'Comunicación',
    color: 'azul' as const,
    fecha: 'Vie 7 nov',
    texto: 'Ya están publicadas las lecturas del siguiente bimestre.',
    nuevo: false,
  },
];

const CURSOS: {
  nombre: string;
  color: CursoColor;
  docente: string;
  porEntregar: number;
}[] = [
  { nombre: 'Matemática', color: 'terracota', docente: 'Prof. Rosa Quispe', porEntregar: 1 },
  { nombre: 'Comunicación', color: 'azul', docente: 'Prof. Luis Paredes', porEntregar: 1 },
  { nombre: 'Ciencia y Tecnología', color: 'bosque', docente: 'Prof. Ana Torres', porEntregar: 1 },
  { nombre: 'Personal Social', color: 'ciruela', docente: 'Prof. Mario Vega', porEntregar: 1 },
  { nombre: 'Inglés', color: 'ocre', docente: 'Prof. Julia Ramos', porEntregar: 0 },
  { nombre: 'Educación Física', color: 'turquesa', docente: 'Prof. Hugo Díaz', porEntregar: 0 },
];

const GRUPOS = ['Vencidas', 'Hoy', 'Esta semana'];

export default function InicioEstudiante() {
  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <HomeBanner titulo="Hola, Valeria" texto="lunes 9 de noviembre" />

      <AnnouncementBanner
        titulo="Ceremonia por el aniversario del colegio"
        texto="El lunes 16 de noviembre no habrá clases por la mañana."
        href="/maqueta/inicio/estudiante"
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <section aria-labelledby="para-hacer" className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="para-hacer"
              className="font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7"
            >
              Para hacer
            </h2>
            <Link
              href="/maqueta/curso"
              className="inline-flex min-h-11 items-center text-base font-semibold text-brand underline underline-offset-4"
            >
              Ver todas
            </Link>
          </div>
          {GRUPOS.map((grupo) => {
            const filas = TAREAS.filter((t) => t.grupo === grupo);
            return (
              <div key={grupo} className="flex flex-col gap-2">
                <h3
                  className={`text-sm font-semibold ${grupo === 'Vencidas' ? 'text-danger' : 'text-ink-2'}`}
                >
                  {grupo}
                </h3>
                <ul className="flex flex-col gap-2">
                  {filas.map((t) => (
                    <TaskRow
                      key={t.titulo}
                      href="/maqueta/curso"
                      titulo={t.titulo}
                      curso={t.curso}
                      color={t.color}
                      plazo={t.plazo}
                      urgencia={t.urgencia}
                      estado="pendiente"
                    />
                  ))}
                </ul>
              </div>
            );
          })}
          <Link
            href="/maqueta/curso"
            className="inline-flex min-h-11 items-center self-start text-base font-semibold text-brand underline underline-offset-4"
          >
            Ver las 8 restantes
          </Link>
        </section>

        <section aria-labelledby="avisos" className="flex flex-col gap-4">
          <h2
            id="avisos"
            className="font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7"
          >
            Avisos
          </h2>
          <ul className="flex flex-col gap-2">
            {AVISOS.map((a) => (
              <li key={a.texto} className="rounded-xl bg-surface p-4 ring-1 ring-line">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {a.nuevo ? (
                    <>
                      <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                      <span className="sr-only">Nuevo: </span>
                    </>
                  ) : null}
                  <span style={cursoStyle(a.color)}>
                    <CourseChip>{a.curso}</CourseChip>
                  </span>
                  <span className="text-sm text-ink-2">{a.fecha}</span>
                </div>
                <p className="line-clamp-2 text-base text-ink">{a.texto}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/maqueta"
            className="inline-flex min-h-11 items-center self-start text-base font-semibold text-brand underline underline-offset-4"
          >
            Ver todos los avisos
          </Link>
        </section>
      </div>

      <section aria-labelledby="mis-cursos-titulo" className="flex flex-col gap-4">
        <h2
          id="mis-cursos-titulo"
          className="font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7"
        >
          Mis cursos
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 md:gap-6">
          {CURSOS.map((c) => (
            <li key={c.nombre}>
              <CourseCard
                nombre={c.nombre}
                seccion="3.° Primaria · A"
                color={c.color}
                href="/maqueta/curso"
                linea={c.docente}
                pie={
                  c.porEntregar > 0 ? (
                    <CourseChip>
                      {c.porEntregar}{' '}
                      {c.porEntregar === 1 ? 'tarea por entregar' : 'tareas por entregar'}
                    </CourseChip>
                  ) : (
                    <AlDia />
                  )
                }
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Estado vacío de "Para hacer" cuando no hay tareas (ejemplo). */}
      <section aria-labelledby="vacio-titulo" className="flex flex-col gap-3">
        <h2
          id="vacio-titulo"
          className="font-heading text-lg leading-[1.625rem] font-semibold text-ink-2 md:text-xl md:leading-7"
        >
          Ejemplo de estado vacío
        </h2>
        <EmptyState
          tono="success"
          icono={CircleCheck}
          titulo="¡Estás al día!"
          texto="No tienes tareas pendientes. Buen trabajo."
          accion={
            <Link
              href="/maqueta"
              className={`${buttonVariants({ variant: 'outline' })} h-11 px-4 text-base`}
            >
              Ver mis notas
            </Link>
          }
        />
      </section>
    </div>
  );
}
