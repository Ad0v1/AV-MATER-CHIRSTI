import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
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

// Superficie base de las tarjetas: sin borde, solo un relleno suave y una sombra casi imperceptible.
const SUPERFICIE = 'rounded-2xl bg-surface/90 shadow-sm shadow-brand/5 backdrop-blur-sm';

// Inicio de estudiantes y docentes. Banner, resumen, cursos en cuadrícula y una columna lateral;
// la jerarquía la dan el espacio y el tamaño del texto, no los bordes.
export function PanelInicio({ role, nombre }: { role: PanelRole; nombre: string | null }) {
  const esDocente = role === 'TEACHER';
  const totalPorCalificar = POR_CALIFICAR_DEMO.reduce((s, p) => s + p.entregadas, 0);

  const resumen: Dato[] = esDocente
    ? [
        { label: 'Cursos a cargo', valor: String(CURSOS_DEMO.length) },
        { label: 'Por calificar', valor: String(totalPorCalificar) },
        { label: 'Entregas nuevas hoy', valor: '0' },
        { label: 'Estudiantes', valor: '0' },
      ]
    : [
        { label: 'Tareas pendientes', valor: String(ENTREGAS_DEMO.length) },
        {
          label: 'Próxima entrega',
          valor: ENTREGAS_DEMO.length > 0 ? etiquetaDias(ENTREGAS_DEMO[0].dias) : '—',
          alerta: ENTREGAS_DEMO.length > 0,
        },
        { label: 'Promedio actual', valor: '—' },
        { label: 'Cursos', valor: String(CURSOS_DEMO.length) },
      ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Bienvenida */}
      <header className="rounded-3xl bg-brand px-6 py-8 text-ink-inverse shadow-sm sm:px-10 sm:py-10">
        <p className="text-xs font-semibold tracking-[0.14em] text-white/70 uppercase">
          <FechaHoy />
        </p>
        <h1
          id="titulo-inicio"
          className="mt-2 font-heading text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
        >
          <Saludo nombre={nombre} />
        </h1>
        <p className="mt-2 max-w-2xl text-base text-white/80">
          {esDocente
            ? 'Esto es lo que necesita tu atención hoy.'
            : 'Tus cursos, lo próximo que debes entregar y tus últimas notas.'}
        </p>
      </header>

      {/* Resumen */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {resumen.map((dato) => (
          <div key={dato.label} className={`flex flex-col-reverse px-6 py-5 ${SUPERFICIE}`}>
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        {/* Cursos */}
        <section aria-labelledby="titulo-cursos">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="titulo-cursos" className="font-heading text-xl font-semibold text-ink">
              Mis cursos
            </h2>
            <span className="text-sm text-ink-2">{CURSOS_DEMO.length} este año</span>
          </div>
          {CURSOS_DEMO.length === 0 ? (
            <Vacio>Aún no tienes cursos asignados.</Vacio>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {CURSOS_DEMO.map((curso) => (
                <li key={`${curso.nombre}-${curso.seccion}`}>
                  <TarjetaCurso curso={curso} esDocente={esDocente} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Lateral: una sola superficie, secciones separadas por espacio y una línea fina */}
        <aside className={`divide-y divide-line p-6 ${SUPERFICIE}`}>
          {esDocente ? (
            <>
              <Seccion titulo="Por calificar">
                {POR_CALIFICAR_DEMO.length === 0 && <Vacio>No hay entregas por calificar.</Vacio>}
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
            </>
          ) : (
            <>
              <Seccion titulo="Próximas entregas">
                {ENTREGAS_DEMO.length === 0 && <Vacio>No tienes entregas pendientes.</Vacio>}
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
                {NOTAS_DEMO.length === 0 && <Vacio>Aún no tienes notas.</Vacio>}
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
            {AVISOS_DEMO.length === 0 && <Vacio>No hay avisos.</Vacio>}
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
        </aside>
      </div>
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

function TarjetaCurso({ curso, esDocente }: { curso: CursoDemo; esDocente: boolean }) {
  const Icon = curso.icon;
  return (
    <article
      className={`relative flex h-full flex-col gap-5 p-6 transition-shadow hover:shadow-md motion-reduce:transition-none ${SUPERFICIE}`}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg font-semibold text-ink">
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
        </div>
      </div>

      {esDocente ? (
        <p className="text-sm text-ink-2">
          {curso.porCalificar > 0 ? (
            <>
              <span className="font-semibold text-ink tabular-nums">{curso.porCalificar}</span>{' '}
              entregas por calificar
            </>
          ) : (
            'Todo calificado'
          )}
        </p>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-ink-2">
            <span>Avance</span>
            <span className="font-semibold text-ink tabular-nums">{curso.avance}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Avance de ${curso.nombre}`}
            aria-valuenow={curso.avance}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${curso.avance}%` }} />
          </div>
        </div>
      )}

      <p className="relative z-10 mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        <Atajo href={COURSE_ROUTES.clases(curso.id)}>Clases</Atajo>
        <Atajo href={COURSE_ROUTES.lecturas(curso.id)}>Lecturas</Atajo>
        <Atajo href={COURSE_ROUTES.tareas(curso.id)}>Tareas</Atajo>
      </p>
    </article>
  );
}

function Atajo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm underline-offset-4 hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
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
    <section className="py-6 first:pt-0 last:pb-0">
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
