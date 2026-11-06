// /admin/estructura — años académicos (RF-09, RF-12; RN-11). Solo ADMIN (lo exige la API).
import Link from 'next/link';
import { Suspense } from 'react';
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
        title="Estructura académica"
        description="Años lectivos, períodos, secciones y cursos. Solo un año puede estar activo; los demás quedan de solo lectura."
        actions={
          <>
            <Link
              href="/admin/estructura/anios/nuevo"
              className={cn(buttonVariants(), TOUCH, 'inline-flex items-center')}
            >
              Nuevo año
            </Link>
            <Link
              href="/admin/estructura/cursos"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                TOUCH,
                'inline-flex items-center',
              )}
            >
              Catálogo de cursos
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

async function YearList() {
  let data: List<YearSummary>;
  try {
    data = await listYears();
  } catch (error) {
    return <LoadError error={error} />;
  }
  if (data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no hay años académicos. Crea el primero con “Nuevo año”.
      </p>
    );
  }
  return (
    <>
      {/* Móvil (< sm): tarjetas */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label="Años académicos">
        {data.items.map((y) => {
          const s = yearStatus(y);
          return (
            <li key={y.id} className="rounded-xl p-4 ring-1 ring-foreground/10">
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
      {/* sm y más: tabla */}
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
                      className="inline-flex min-h-11 items-center underline underline-offset-4"
                    >
                      Ver año {y.year}
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
