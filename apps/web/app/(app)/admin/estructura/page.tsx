// /admin/estructura — años académicos (RF-09, RF-12; RN-11). Solo ADMIN (lo exige la API).
import Link from 'next/link';
import { Suspense } from 'react';
import { ROUTE_META } from '@/lib/route-meta';
import { ArrowRight, BookOpen, CalendarPlus, Plus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TOUCH } from '@/app/(app)/admin/_shared/components/styles';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  StatusBadge,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { listYears } from './_lib/data';
import { formatInstant, yearStatus } from './_lib/format';
import type { List, YearSummary } from './_lib/types';

export const metadata = { title: 'Estructura académica' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/estructura'].title}
        description={ROUTE_META['/admin/estructura'].description}
        actions={
          <>
            {/* Una acción principal sólida y una secundaria solo de texto, sin borde. */}
            <Link
              href="/admin/estructura/cursos"
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                TOUCH,
                'inline-flex items-center gap-2 text-ink-2 hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              <BookOpen className="size-4" aria-hidden="true" />
              Catálogo de cursos
            </Link>
            <Link
              href="/admin/estructura/anios/nuevo"
              className={cn(buttonVariants(), TOUCH, 'inline-flex items-center gap-2')}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nuevo año
            </Link>
          </>
        }
      />
      <Suspense fallback={<LoadingBlock label="Cargando años académicos…" />}>
        <YearList />
      </Suspense>
    </PageShell>
  );
}

const PASOS = [
  { titulo: 'Crea el año', texto: 'Define el año lectivo y actívalo.' },
  { titulo: 'Agrega períodos', texto: 'Bimestres o trimestres con sus fechas.' },
  { titulo: 'Crea las secciones', texto: 'Grado y sección de cada grupo.' },
  { titulo: 'Asigna los cursos', texto: 'Un docente por curso y sección.' },
];

// Estado vacío: explica qué falta y cómo seguir, con una sola acción principal.
function EmptyYears() {
  return (
    <section aria-labelledby="sin-anios" className="px-2 py-10 sm:py-14">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <CalendarPlus className="size-7" aria-hidden="true" />
        </span>
        <h2 id="sin-anios" className="mt-5 font-heading text-xl font-semibold">
          Aún no hay años académicos
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Empieza creando el año lectivo. Después podrás agregar sus períodos, secciones y cursos.
        </p>
        <Link
          href="/admin/estructura/anios/nuevo"
          className={cn(buttonVariants(), TOUCH, 'mt-6 inline-flex items-center gap-2')}
        >
          <Plus className="size-4" aria-hidden="true" />
          Crear el primer año
        </Link>
      </div>
      <ol className="mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PASOS.map((paso, i) => (
          <li key={paso.titulo} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand tabular-nums"
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{paso.titulo}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{paso.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function YearList() {
  let data: List<YearSummary>;
  try {
    data = await listYears();
  } catch (error) {
    return <LoadError error={error} />;
  }
  if (data.items.length === 0) return <EmptyYears />;
  return (
    <>
      {/* Móvil (< sm): tarjetas */}
      <ul className="flex flex-col sm:hidden" aria-label="Años académicos">
        {data.items.map((y) => {
          const s = yearStatus(y);
          return (
            <li key={y.id} className="border-b border-line/60 py-4 first:pt-0 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-lg font-semibold">{y.year}</span>
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.detail}
                {y.closedAt ? ` Cerrado el ${formatInstant(y.closedAt)}.` : ''}
              </p>
              <Link
                href={`/admin/estructura/anios/${y.id}`}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  TOUCH,
                  'mt-3 inline-flex w-full items-center',
                )}
              >
                Ver año {y.year}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* sm y más: tabla directa sobre el fondo, solo con líneas finas entre filas */}
      <div className="hidden sm:block">
        <Table>
          <TableCaption className="sr-only">
            Años académicos, del más reciente al más antiguo
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Año</TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col">Detalle</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((y) => {
              const s = yearStatus(y);
              return (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.year}</TableCell>
                  <TableCell>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {s.detail}
                    {y.closedAt ? ` Cerrado el ${formatInstant(y.closedAt)}.` : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/estructura/anios/${y.id}`}
                      className="group/ver inline-flex min-h-11 md:min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-brand hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
                    >
                      Ver año<span className="sr-only"> {y.year}</span>
                      <ArrowRight
                        className="size-4 transition-transform group-hover/ver:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
