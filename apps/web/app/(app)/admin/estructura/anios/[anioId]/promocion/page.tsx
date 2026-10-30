// /admin/estructura/anios/[anioId]/promocion — promoción en bloque al año [anioId] (RF-16, RN-15).
import { Suspense } from 'react';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  ReadOnlyNotice,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { PromotionScreen } from '../../../_components/promotion-screen';
import { getPromotionProposal, getYear, listYears } from '../../../_lib/data';
import { previousYearOf, type PromotionProposal } from '../../../_lib/promotion-machine';
import type { YearDetail } from '../../../_lib/types';
import { isUuid } from '../../../_lib/validation';
import { ApiError } from '@/lib/api/errors';

export default function Page({ params }: PageProps<'/admin/estructura/anios/[anioId]/promocion'>) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingBlock rows={6} label="Preparando la propuesta de promoción…" />}>
        <PromotionView params={params} />
      </Suspense>
    </PageShell>
  );
}

const CRUMB_ROOT = { href: '/admin/estructura', label: 'Estructura académica' };

async function PromotionView({ params }: { params: Promise<{ anioId: string }> }) {
  const { anioId } = await params;
  const yearHref = (id: string) => `/admin/estructura/anios/${encodeURIComponent(id)}`;
  const header = (year?: YearDetail, sourceYear?: number) => (
    <PageHeader
      title={
        year && sourceYear
          ? `Promoción de ${sourceYear} a ${year.year}`
          : year
            ? `Promoción a ${year.year}`
            : 'Promoción'
      }
      description="El sistema propone a qué sección pasa cada estudiante. Revisa, corrige y confirma: nada se aplica hasta que confirmes."
      crumbs={[
        CRUMB_ROOT,
        year ? { href: yearHref(year.id), label: String(year.year) } : { label: 'Año' },
        { label: 'Promoción' },
      ]}
    />
  );
  if (!isUuid(anioId)) {
    return (
      <>
        {header()}
        <LoadError
          error={new ApiError(404, 'NOT_FOUND', 'El año académico no existe')}
          backHref="/admin/estructura"
        />
      </>
    );
  }

  let year: YearDetail;
  let source: { id: string; year: number } | null;
  try {
    const [target, years] = await Promise.all([getYear(anioId), listYears()]);
    year = target;
    source = previousYearOf(years.items, target);
  } catch (error) {
    return (
      <>
        {header()}
        <LoadError error={error} backHref="/admin/estructura" />
      </>
    );
  }
  if (!source) {
    return (
      <>
        {header(year)}
        <ReadOnlyNotice title="No hay año de origen">
          <p>
            Para promover a {year.year} debe existir el año {year.year - 1}. Los estudiantes se
            promueven solo del año inmediatamente anterior.
          </p>
        </ReadOnlyNotice>
      </>
    );
  }

  let proposal: PromotionProposal;
  try {
    proposal = await getPromotionProposal(year.id, source.id);
  } catch (error) {
    return (
      <>
        {header(year, source.year)}
        <LoadError error={error} backHref={yearHref(year.id)} />
      </>
    );
  }
  return (
    <>
      {header(year, source.year)}
      <PromotionScreen proposal={proposal} targetHref={yearHref(year.id)} />
    </>
  );
}
