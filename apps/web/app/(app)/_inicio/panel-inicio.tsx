import Link from 'next/link';
import { PageShell } from '@/components/layout/page-shell';
import { ArrowRight, BookOpen } from 'lucide-react';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';
import { type Role } from '@/lib/roles';
import type { CursoInicio, DatosInicio } from './datos';
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
export function PanelInicio({
  role,
  nombre,
  datos,
}: {
  role: PanelRole;
  nombre: string | null;
  datos: DatosInicio;
}) {
  const esDocente = role === 'TEACHER';
  const { cursos, entregas, avisos } = datos;

  const resumen: Dato[] = esDocente
    ? [
        { label: 'Cursos a cargo', valor: cursos.error ? '—' : String(cursos.items.length) },
        { label: 'Avisos recientes', valor: avisos.error ? '—' : String(avisos.items.length) },
      ]
    : [
        {
          label: 'Entregas en 14 días',
          valor: entregas.error ? '—' : String(entregas.items.length),
        },
        {
          label: 'Próxima entrega',
          valor: entregas.items.length > 0 ? etiquetaDias(entregas.items[0].dias) : '—',
          alerta: entregas.items.length > 0 && entregas.items[0].dias <= 1,
        },
        { label: 'Cursos', valor: cursos.error ? '—' : String(cursos.items.length) },
      ];

  return (
    <PageShell width="wide">
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
      <dl
        className={`grid grid-cols-2 gap-3 lg:gap-4 ${resumen.length === 2 ? '' : 'lg:grid-cols-3'}`}
      >
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
            <span className="text-sm text-ink-2">{cursos.items.length} este año</span>
          </div>
          {cursos.error ? (
            <Vacio>No se pudieron cargar tus cursos. Vuelve a intentarlo en un momento.</Vacio>
          ) : cursos.items.length === 0 ? (
            <Vacio>Aún no tienes cursos asignados.</Vacio>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {cursos.items.map((curso) => (
                <li key={curso.id}>
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
                <Vacio>
                  Revisa las entregas en la pestaña Tareas de cada curso y califica desde el
                  Registro auxiliar.
                </Vacio>
              </Seccion>
            </>
          ) : (
            <>
              <Seccion titulo="Próximas entregas">
                {entregas.error && <Vacio>No se pudieron cargar las entregas.</Vacio>}
                {!entregas.error && entregas.items.length === 0 && (
                  <Vacio>No tienes entregas en los próximos 14 días.</Vacio>
                )}
                <ul className="grid gap-5">
                  {entregas.items.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-4">
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
                <Vacio>Tus notas y logros de cada curso, por bimestre.</Vacio>
              </Seccion>
            </>
          )}

          <Seccion titulo="Avisos" href={ROUTES.anuncios} verTodo="Ver todos los avisos">
            {avisos.error && <Vacio>No se pudieron cargar los avisos.</Vacio>}
            {!avisos.error && avisos.items.length === 0 && <Vacio>No hay avisos.</Vacio>}
            <ul className="grid gap-5">
              {avisos.items.map((a) => (
                <li key={a.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{a.titulo}</p>
                    <span className="shrink-0 text-xs text-ink-2">{a.fecha}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.texto}</p>
                </li>
              ))}
            </ul>
          </Seccion>
        </aside>
      </div>
    </PageShell>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-2">{children}</p>;
}

function TarjetaCurso({ curso, esDocente }: { curso: CursoInicio; esDocente: boolean }) {
  const Icon = BookOpen;
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
            {esDocente || !curso.docente ? curso.seccion : `${curso.seccion} · ${curso.docente}`}
          </p>
        </div>
      </div>

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
