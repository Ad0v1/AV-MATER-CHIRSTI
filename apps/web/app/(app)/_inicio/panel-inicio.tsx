import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';
import { type Role } from '@/lib/roles';
import {
  AVISOS_DEMO,
  CURSOS_DEMO,
  ENTREGAS_DEMO,
  NOTAS_DEMO,
  POR_CALIFICAR_DEMO,
  type CursoDemo,
} from './datos-demo';
import { FechaHoy, Saludo } from './hora-local';

type PanelRole = Extract<Role, 'TEACHER' | 'STUDENT'>;

function etiquetaDias(dias: number) {
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}

type Dato = { label: string; valor: string; alerta?: boolean };

// Inicio de estudiantes y docentes: una sola superficie, sin recuadros internos. La jerarquía la dan
// el espacio, el tamaño del texto y líneas finas entre secciones.
export function PanelInicio({ role, nombre }: { role: PanelRole; nombre: string | null }) {
  const esDocente = role === 'TEACHER';
  const totalPorCalificar = POR_CALIFICAR_DEMO.reduce((s, p) => s + p.entregadas, 0);

  const resumen: Dato[] = esDocente
    ? [
        { label: 'Cursos a cargo', valor: String(CURSOS_DEMO.length) },
        { label: 'Por calificar', valor: String(totalPorCalificar) },
        { label: 'Entregas nuevas hoy', valor: '12' },
        { label: 'Estudiantes', valor: '142' },
      ]
    : [
        { label: 'Tareas pendientes', valor: String(ENTREGAS_DEMO.length) },
        { label: 'Próxima entrega', valor: etiquetaDias(ENTREGAS_DEMO[0].dias), alerta: true },
        { label: 'Promedio actual', valor: '16,4' },
        { label: 'Cursos', valor: String(CURSOS_DEMO.length) },
      ];

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <article className="rounded-3xl border border-surface/80 bg-surface/90 p-6 shadow-xl shadow-brand/5 backdrop-blur-md sm:p-10">
        {/* Saludo */}
        <header>
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-3 uppercase">
            <FechaHoy />
          </p>
          <h1
            id="titulo-inicio"
            className="mt-2 font-heading text-3xl leading-tight font-semibold tracking-tight text-brand sm:text-4xl"
          >
            <Saludo nombre={nombre} />
          </h1>
          <p className="mt-2 max-w-2xl text-base text-ink-2">
            {esDocente
              ? 'Esto es lo que necesita tu atención hoy.'
              : 'Tus cursos, lo próximo que debes entregar y tus últimas notas.'}
          </p>
        </header>

        {/* Resumen */}
        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-line py-8 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-line">
          {resumen.map((dato) => (
            <div
              key={dato.label}
              className="flex flex-col-reverse lg:px-8 lg:first:pl-0 lg:last:pr-0"
            >
              <dt className="mt-1 text-sm text-ink-2">{dato.label}</dt>
              <dd
                className={`font-heading text-3xl font-semibold tabular-nums ${
                  dato.alerta ? 'text-danger' : 'text-ink'
                }`}
              >
                {dato.valor}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-12 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-0">
          {/* Cursos */}
          <section aria-labelledby="titulo-cursos" className="xl:pr-10">
            <h2 id="titulo-cursos" className="font-heading text-xl font-semibold text-ink">
              Mis cursos
            </h2>
            <ul className="mt-2 divide-y divide-line">
              {CURSOS_DEMO.map((curso) => (
                <FilaCurso
                  key={`${curso.nombre}-${curso.seccion}`}
                  curso={curso}
                  esDocente={esDocente}
                />
              ))}
            </ul>
          </section>

          {/* Lateral */}
          <div className="grid content-start gap-10 xl:border-l xl:border-line xl:pl-10">
            {esDocente ? (
              <>
                <Seccion titulo="Por calificar">
                  <ul className="grid gap-5">
                    {POR_CALIFICAR_DEMO.map((p) => {
                      const pct = Math.round((p.entregadas / p.total) * 100);
                      return (
                        <li key={p.titulo}>
                          <p className="text-sm font-semibold text-ink">{p.titulo}</p>
                          <p className="text-xs text-ink-2">{p.curso}</p>
                          <div className="mt-2 flex items-center gap-3">
                            <div
                              role="progressbar"
                              aria-label={`${p.entregadas} de ${p.total} entregas`}
                              aria-valuenow={pct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className="h-1 flex-1 overflow-hidden rounded-full bg-line"
                            >
                              <div
                                className="h-full rounded-full bg-brand"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-ink-2 tabular-nums">
                              {p.entregadas}/{p.total}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Seccion>
                <Seccion titulo="Acciones rápidas">
                  <ul className="grid gap-1">
                    <Enlace href={COURSE_ROUTES.tareas('demo')}>Crear una tarea</Enlace>
                    <Enlace href={COURSE_ROUTES.lecturas('demo')}>Subir una lectura</Enlace>
                    <Enlace href={COURSE_ROUTES.registro('demo')}>Abrir registro auxiliar</Enlace>
                  </ul>
                </Seccion>
              </>
            ) : (
              <>
                <Seccion
                  titulo="Próximas entregas"
                  href={COURSE_ROUTES.tareas('demo')}
                  verTodo="Ver tareas"
                >
                  <ul className="grid gap-5">
                    {ENTREGAS_DEMO.map((e) => (
                      <li key={e.titulo} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{e.titulo}</p>
                          <p className="text-xs text-ink-2">{e.curso}</p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-medium ${
                            e.dias <= 1 ? 'text-danger' : 'text-ink-2'
                          }`}
                        >
                          {etiquetaDias(e.dias)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Seccion>
                <Seccion titulo="Últimas notas" href={ROUTES.misNotas} verTodo="Ver mis notas">
                  <ul className="grid gap-5">
                    {NOTAS_DEMO.map((n) => (
                      <li key={n.tarea} className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{n.tarea}</p>
                          <p className="text-xs text-ink-2">{n.curso}</p>
                        </div>
                        <span
                          className={`shrink-0 font-heading text-xl font-semibold tabular-nums ${
                            n.nota >= 11 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {n.nota}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Seccion>
              </>
            )}

            <Seccion titulo="Avisos">
              <ul className="grid gap-5">
                {AVISOS_DEMO.map((a) => (
                  <li key={a.titulo}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">{a.titulo}</p>
                      <span className="shrink-0 text-xs text-ink-3">{a.fecha}</span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.texto}</p>
                  </li>
                ))}
              </ul>
            </Seccion>
          </div>
        </div>

        <p className="mt-10 text-xs text-ink-3">
          Vista con datos de ejemplo hasta conectar los cursos reales.
        </p>
      </article>
    </div>
  );
}

function FilaCurso({ curso, esDocente }: { curso: CursoDemo; esDocente: boolean }) {
  const Icon = curso.icon;
  return (
    <li className="group/curso relative -mx-3 flex items-center gap-4 px-3 py-4 transition-colors hover:bg-row-hover motion-reduce:transition-none">
      <Icon className="size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-heading text-base font-semibold text-ink">
          <Link
            href={COURSE_ROUTES.clases(curso.id)}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
          >
            {curso.nombre}
          </Link>
        </h3>
        <p className="truncate text-sm text-ink-2">
          {esDocente
            ? `${curso.seccion} · ${curso.alumnos} estudiantes`
            : `${curso.seccion} · ${curso.docente}`}
        </p>
        <p className="relative z-10 mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
          <Atajo href={COURSE_ROUTES.clases(curso.id)}>Clases</Atajo>
          <Atajo href={COURSE_ROUTES.lecturas(curso.id)}>Lecturas</Atajo>
          <Atajo href={COURSE_ROUTES.tareas(curso.id)}>Tareas</Atajo>
        </p>
      </div>

      <div className="hidden w-32 shrink-0 text-right sm:block">
        {esDocente ? (
          <p className="text-sm text-ink-2">
            {curso.porCalificar > 0 ? (
              <>
                <span className="font-semibold text-ink tabular-nums">{curso.porCalificar}</span>{' '}
                por calificar
              </>
            ) : (
              'Al día'
            )}
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink tabular-nums">{curso.avance}%</p>
            <div
              role="progressbar"
              aria-label={`Avance de ${curso.nombre}`}
              aria-valuenow={curso.avance}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${curso.avance}%` }} />
            </div>
          </>
        )}
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-ink-disabled transition-colors group-hover/curso:text-brand motion-reduce:transition-none"
        aria-hidden="true"
      />
    </li>
  );
}

function Atajo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm underline-offset-2 hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
    >
      {children}
    </Link>
  );
}

function Seccion({
  titulo,
  href,
  verTodo,
  children,
}: {
  titulo: string;
  href?: string;
  verTodo?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 font-heading text-lg font-semibold text-ink">{titulo}</h2>
      {children}
      {href && verTodo && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
        >
          {verTodo}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="group/enlace -mx-2 flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-medium text-ink transition-colors hover:bg-row-hover hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active motion-reduce:transition-none"
      >
        {children}
        <ArrowRight
          className="size-4 text-ink-disabled group-hover/enlace:text-brand"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
