import Link from 'next/link';
import {
  AlarmClock,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Inbox,
  Notebook,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';
import { ROLE_LABELS, type Role } from '@/lib/roles';
import {
  AVISOS_DEMO,
  CURSOS_DEMO,
  ENTREGAS_DEMO,
  NOTAS_DEMO,
  POR_CALIFICAR_DEMO,
  type CursoDemo,
} from './datos-demo';

type PanelRole = Extract<Role, 'TEACHER' | 'STUDENT'>;

const ZONA = 'America/Lima';

function saludo(ahora: Date) {
  const hora = Number(
    new Intl.DateTimeFormat('es-PE', { hour: 'numeric', hour12: false, timeZone: ZONA }).format(
      ahora,
    ),
  );
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function fechaLarga(ahora: Date) {
  const texto = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: ZONA,
  }).format(ahora);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function etiquetaDias(dias: number) {
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `En ${dias} días`;
}

export function PanelInicio({ role }: { role: PanelRole }) {
  const ahora = new Date();
  const esDocente = role === 'TEACHER';
  const totalPorCalificar = POR_CALIFICAR_DEMO.reduce((s, p) => s + p.entregadas, 0);

  const resumen: Resumen[] = esDocente
    ? [
        {
          label: 'Cursos a cargo',
          valor: String(CURSOS_DEMO.length),
          icon: GraduationCap,
          tono: 'brand',
        },
        {
          label: 'Por calificar',
          valor: String(totalPorCalificar),
          icon: ClipboardCheck,
          tono: 'gold',
        },
        { label: 'Entregas nuevas hoy', valor: '12', icon: Inbox, tono: 'info' },
        { label: 'Estudiantes', valor: '142', icon: Users, tono: 'success' },
      ]
    : [
        {
          label: 'Tareas pendientes',
          valor: String(ENTREGAS_DEMO.length),
          icon: ClipboardList,
          tono: 'gold',
        },
        {
          label: 'Próxima entrega',
          valor: etiquetaDias(ENTREGAS_DEMO[0].dias),
          icon: AlarmClock,
          tono: 'danger',
        },
        { label: 'Promedio actual', valor: '16,4', icon: TrendingUp, tono: 'success' },
        {
          label: 'Mis cursos',
          valor: String(CURSOS_DEMO.length),
          icon: GraduationCap,
          tono: 'brand',
        },
      ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Bienvenida */}
      <section
        aria-labelledby="titulo-inicio"
        className="relative isolate overflow-hidden rounded-2xl bg-brand px-5 py-6 text-ink-inverse shadow-sm sm:px-8 sm:py-8"
      >
        <div
          aria-hidden="true"
          className="absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-gold/25 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-20 left-1/3 -z-10 size-48 rounded-full bg-white/10 blur-2xl"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-white/75">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {fechaLarga(ahora)}
          </span>
          <span className="rounded-full bg-gold px-2.5 py-1 text-brand-dark">
            {ROLE_LABELS[role]}
          </span>
        </div>
        <h1
          id="titulo-inicio"
          className="mt-4 font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {saludo(ahora)}, bienvenido al Aula Virtual
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
          {esDocente
            ? 'Revisa lo que necesita tu atención hoy y entra directo a tus cursos.'
            : 'Aquí tienes tus cursos, lo próximo que debes entregar y tus últimas notas.'}
        </p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/65">
          <Sparkles className="size-3.5 text-gold" aria-hidden="true" />
          Vista con datos de ejemplo hasta conectar los cursos reales.
        </p>
      </section>

      {/* Resumen */}
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {resumen.map((item) => (
          <TarjetaResumen key={item.label} {...item} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* Columna principal: cursos */}
        <section aria-labelledby="titulo-cursos" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 id="titulo-cursos" className="font-heading text-lg font-semibold text-ink">
              Mis cursos
            </h2>
            <span className="text-sm text-ink-2">{CURSOS_DEMO.length} cursos este año</span>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {CURSOS_DEMO.map((curso) => (
              <li key={`${curso.nombre}-${curso.seccion}`}>
                <TarjetaCurso curso={curso} esDocente={esDocente} />
              </li>
            ))}
          </ul>
        </section>

        {/* Columna lateral */}
        <div className="flex flex-col gap-6">
          {esDocente ? (
            <>
              <Panel titulo="Por calificar" icon={ClipboardCheck}>
                <ul className="flex flex-col divide-y divide-line">
                  {POR_CALIFICAR_DEMO.map((p) => {
                    const pct = Math.round((p.entregadas / p.total) * 100);
                    return (
                      <li key={p.titulo} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-sm font-semibold text-ink">{p.titulo}</p>
                        <p className="text-xs text-ink-2">{p.curso}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            role="progressbar"
                            aria-label={`${p.entregadas} de ${p.total} entregas`}
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
                          >
                            <div
                              className="h-full rounded-full bg-gold-dark"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-ink-2 tabular-nums">
                            {p.entregadas}/{p.total}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              <Panel titulo="Acciones rápidas" icon={Sparkles}>
                <div className="grid gap-2">
                  <AccionRapida href={COURSE_ROUTES.tareas('demo')} icon={ClipboardList}>
                    Crear una tarea
                  </AccionRapida>
                  <AccionRapida href={COURSE_ROUTES.lecturas('demo')} icon={Notebook}>
                    Subir una lectura
                  </AccionRapida>
                  <AccionRapida href={COURSE_ROUTES.registro('demo')} icon={ClipboardCheck}>
                    Abrir registro auxiliar
                  </AccionRapida>
                </div>
              </Panel>
            </>
          ) : (
            <>
              <Panel titulo="Próximas entregas" icon={AlarmClock}>
                <ul className="flex flex-col divide-y divide-line">
                  {ENTREGAS_DEMO.map((e) => {
                    const urgente = e.dias <= 1;
                    return (
                      <li
                        key={e.titulo}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-semibold ${
                            urgente ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-2'
                          }`}
                        >
                          {etiquetaDias(e.dias)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{e.titulo}</span>
                          <span className="block text-xs text-ink-2">{e.curso}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <VerTodo href={COURSE_ROUTES.tareas('demo')}>Ver todas las tareas</VerTodo>
              </Panel>
              <Panel titulo="Últimas notas" icon={CheckCircle2}>
                <ul className="flex flex-col divide-y divide-line">
                  {NOTAS_DEMO.map((n) => (
                    <li
                      key={n.tarea}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {n.tarea}
                        </span>
                        <span className="block text-xs text-ink-2">{n.curso}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${
                          n.nota >= 11
                            ? 'bg-success-soft text-success'
                            : 'bg-danger-soft text-danger'
                        }`}
                      >
                        {n.nota}
                      </span>
                    </li>
                  ))}
                </ul>
                <VerTodo href={ROUTES.misNotas}>Ver mis notas</VerTodo>
              </Panel>
            </>
          )}

          <Panel titulo="Avisos" icon={Bell}>
            <ul className="flex flex-col gap-3">
              {AVISOS_DEMO.map((a) => (
                <li key={a.titulo} className="rounded-xl bg-gold-soft/70 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">{a.titulo}</p>
                    <span className="shrink-0 text-xs text-ink-2">{a.fecha}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">{a.texto}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

type Tono = 'brand' | 'gold' | 'info' | 'success' | 'danger';
type Resumen = { label: string; valor: string; icon: LucideIcon; tono: Tono };

const TONOS: Record<Tono, string> = {
  brand: 'bg-brand-soft text-brand',
  gold: 'bg-gold-soft text-warning',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
};

function TarjetaResumen({ label, valor, icon: Icon, tono }: Resumen) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/90 p-4 shadow-xs backdrop-blur-sm">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONOS[tono]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-heading text-xl font-semibold text-ink tabular-nums sm:text-2xl">
          {valor}
        </p>
        <p className="truncate text-xs text-ink-2">{label}</p>
      </div>
    </div>
  );
}

function TarjetaCurso({ curso, esDocente }: { curso: CursoDemo; esDocente: boolean }) {
  const Icon = curso.icon;
  return (
    <article className="group/curso flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition-shadow hover:shadow-md motion-reduce:transition-none">
      <div className="h-1.5 bg-linear-to-r from-brand via-line-active to-gold" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-heading text-base font-semibold text-ink">
              <Link
                href={COURSE_ROUTES.clases(curso.id)}
                className="rounded-sm after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
              >
                {curso.nombre}
              </Link>
            </h3>
            <p className="truncate text-xs text-ink-2">
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
                <span className="font-semibold text-warning tabular-nums">
                  {curso.porCalificar}
                </span>{' '}
                entregas por calificar
              </>
            ) : (
              'Todo calificado'
            )}
          </p>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2">
              <span>Avance del curso</span>
              <span className="font-semibold text-ink tabular-nums">{curso.avance}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Avance de ${curso.nombre}`}
              aria-valuenow={curso.avance}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${curso.avance}%` }} />
            </div>
          </div>
        )}

        <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
          <Atajo href={COURSE_ROUTES.clases(curso.id)}>Clases</Atajo>
          <Atajo href={COURSE_ROUTES.lecturas(curso.id)}>Lecturas</Atajo>
          <Atajo href={COURSE_ROUTES.tareas(curso.id)}>Tareas</Atajo>
        </div>
      </div>
    </article>
  );
}

function Atajo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-8 items-center rounded-lg bg-surface-2 px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}

function Panel({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface/95 p-4 shadow-xs backdrop-blur-sm">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold text-ink">
        <Icon className="size-4 text-brand" aria-hidden="true" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function AccionRapida({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm font-medium text-ink transition-colors hover:border-line-active hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active motion-reduce:transition-none"
    >
      <Icon className="size-4 text-brand" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      <ArrowRight className="size-4 text-ink-3" aria-hidden="true" />
    </Link>
  );
}

function VerTodo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
