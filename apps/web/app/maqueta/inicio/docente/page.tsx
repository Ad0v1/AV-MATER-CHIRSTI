import Link from 'next/link';
import { Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cursoStyle, type CursoColor } from '../../_componentes/colores';
import { AlDia, CourseCard, CourseChip } from '../../_componentes/course-card';
import { HomeBanner } from '../../_componentes/image-banner';
import { TaskRow } from '../../_componentes/task-row';

// Datos ficticios.
const POR_CALIFICAR: {
  tarea: string;
  curso: string;
  color: CursoColor;
  cantidad: number;
}[] = [
  { tarea: 'Ensayo 1', curso: 'Comunicación · 3.° Primaria · A', color: 'azul', cantidad: 12 },
  {
    tarea: 'Práctica de fracciones',
    curso: 'Matemática · 3.° Primaria · A',
    color: 'terracota',
    cantidad: 9,
  },
  { tarea: 'Ensayo 1', curso: 'Comunicación · 2.° Secundaria · B', color: 'azul', cantidad: 4 },
];

const PLAZOS: {
  tarea: string;
  curso: string;
  color: CursoColor;
  plazo: string;
  entregaron: string;
}[] = [
  {
    tarea: 'Problemas de geometría',
    curso: 'Matemática · 3.° Primaria · A',
    color: 'terracota',
    plazo: 'Mañana, 11:59 p. m.',
    entregaron: '18 de 28 entregaron',
  },
  {
    tarea: 'Comprensión lectora 2',
    curso: 'Comunicación · 2.° Secundaria · B',
    color: 'azul',
    plazo: 'Vie 14 nov, 11:59 p. m.',
    entregaron: '6 de 27 entregaron',
  },
];

const AVISOS = [
  {
    fecha: 'Hoy',
    texto: 'Reunión de docentes el miércoles a las 3:00 p. m. en la sala de profesores.',
  },
  { fecha: 'Vie 7 nov', texto: 'El registro del bimestre se cierra el 28 de noviembre.' },
];

const CURSOS: {
  nombre: string;
  seccion: string;
  color: CursoColor;
  estudiantes: number;
  porCalificar: number;
}[] = [
  {
    nombre: 'Matemática',
    seccion: '3.° Primaria · A',
    color: 'terracota',
    estudiantes: 28,
    porCalificar: 9,
  },
  {
    nombre: 'Comunicación',
    seccion: '3.° Primaria · A',
    color: 'azul',
    estudiantes: 28,
    porCalificar: 12,
  },
  {
    nombre: 'Comunicación',
    seccion: '2.° Secundaria · B',
    color: 'azul',
    estudiantes: 27,
    porCalificar: 4,
  },
  {
    nombre: 'Personal Social',
    seccion: '5 años · Inicial',
    color: 'ciruela',
    estudiantes: 22,
    porCalificar: 0,
  },
];

const h2 = 'font-heading text-lg leading-[1.625rem] font-semibold md:text-xl md:leading-7';

export default function InicioDocente() {
  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <HomeBanner titulo="Hola, Rosa" texto="lunes 9 de noviembre" />

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <section aria-labelledby="por-calificar" className="flex flex-col gap-4 lg:col-span-2">
          <h2 id="por-calificar" className={h2}>
            Por calificar
          </h2>
          <ul className="flex flex-col gap-2">
            {POR_CALIFICAR.map((p) => (
              <TaskRow
                key={`${p.tarea}-${p.curso}`}
                href="/maqueta/curso"
                titulo={p.tarea}
                curso={p.curso}
                color={p.color}
                extra={`${p.cantidad} por calificar`}
                accion={
                  <span className={`${buttonVariants({ variant: 'default' })} h-11 px-4 text-base`}>
                    Calificar
                  </span>
                }
              />
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="plazos" className="flex flex-col gap-4">
            <h2 id="plazos" className={h2}>
              Próximos plazos
            </h2>
            <ul className="flex flex-col gap-2">
              {PLAZOS.map((p) => (
                <TaskRow
                  key={p.tarea}
                  href="/maqueta/curso"
                  titulo={p.tarea}
                  curso={p.curso}
                  color={p.color}
                  plazo={p.plazo}
                  extra={p.entregaron}
                />
              ))}
            </ul>
          </section>

          <section aria-labelledby="avisos-docente" className="flex flex-col gap-4">
            <h2 id="avisos-docente" className={h2}>
              Avisos
            </h2>
            <ul className="flex flex-col gap-2">
              {AVISOS.map((a) => (
                <li key={a.texto} className="rounded-xl bg-surface p-4 ring-1 ring-line">
                  <div className="mb-2 flex items-center gap-2" style={cursoStyle('cacao')}>
                    <CourseChip>Colegio</CourseChip>
                    <span className="text-sm text-ink-2">{a.fecha}</span>
                  </div>
                  <p className="line-clamp-2 text-base text-ink">{a.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section aria-labelledby="mis-cursos-docente" className="flex flex-col gap-4">
        <h2 id="mis-cursos-docente" className={h2}>
          Mis cursos
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 md:gap-6">
          {CURSOS.map((c) => (
            <li key={`${c.nombre}-${c.seccion}`}>
              <CourseCard
                nombre={c.nombre}
                seccion={c.seccion}
                color={c.color}
                href="/maqueta/curso"
                linea={`${c.estudiantes} estudiantes`}
                pie={
                  <>
                    {c.porCalificar > 0 ? (
                      <CourseChip>{c.porCalificar} por calificar</CourseChip>
                    ) : (
                      <AlDia texto="Sin pendientes" />
                    )}
                    {/* Acción rápida solo en escritorio; sobre el enlace de la tarjeta. */}
                    <Link
                      href="/maqueta/curso"
                      className={`${buttonVariants({ variant: 'outline' })} relative z-20 ml-auto hidden h-11 gap-1.5 px-3 text-base md:inline-flex`}
                    >
                      <Plus aria-hidden="true" />
                      Nueva tarea
                      <span className="sr-only">
                        en {c.nombre} {c.seccion}
                      </span>
                    </Link>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
