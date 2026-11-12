// /admin/estructura/anios/nuevo — crear año académico con sus 4 períodos (RF-09, RF-10).
import { Suspense } from 'react';
import { ROUTE_META } from '@/lib/route-meta';
import { NewYearForm } from '../../_components/new-year-form';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { listYears } from '../../_lib/data';

export const metadata = { title: 'Nuevo año académico' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/estructura/anios/nuevo'].title}
        description={ROUTE_META['/admin/estructura/anios/nuevo'].description}
        crumbs={ROUTE_META['/admin/estructura/anios/nuevo'].crumbs}
      />
      <Suspense fallback={<LoadingBlock rows={4} label="Preparando el formulario…" />}>
        <FormWithSuggestion />
      </Suspense>
    </PageShell>
  );
}

/** Sugiere el año siguiente al más reciente; si no hay años, el año actual en Lima. */
async function FormWithSuggestion() {
  let years: number[];
  try {
    years = (await listYears()).items.map((y) => y.year);
  } catch (error) {
    return <LoadError error={error} backHref="/admin/estructura" />;
  }
  const limaYear = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(
      new Date(),
    ),
  );
  const suggested = years.length > 0 ? Math.min(Math.max(...years) + 1, 2100) : limaYear;
  return <NewYearForm suggestedYear={suggested} />;
}
