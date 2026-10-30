// /admin/estructura/anios/[anioId]/clonar — copiar la estructura de un año anterior (RF-15).
import { Suspense } from 'react';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { CloneStructure } from '../../../_components/clone-structure';
import {
  cloneBlockReason,
  previousYears,
  sourceOptions,
  type SourceCandidate,
} from '../../../_lib/clone';
import { getYear, listSections, listYears } from '../../../_lib/data';
import type { YearDetail } from '../../../_lib/types';
import { isUuid } from '../../../_lib/validation';
import { ApiError } from '@/lib/api/errors';

export default function Page({ params }: PageProps<'/admin/estructura/anios/[anioId]/clonar'>) {
  return (
    <PageShell>
      <Suspense fallback={<LoadingBlock rows={4} label="Cargando los años académicos…" />}>
        <CloneView params={params} />
      </Suspense>
    </PageShell>
  );
}

const CRUMB_ROOT = { href: '/admin/estructura', label: 'Estructura académica' };

async function CloneView({ params }: { params: Promise<{ anioId: string }> }) {
  const { anioId } = await params;
  const header = (year?: YearDetail) => (
    <PageHeader
      title={year ? `Copiar estructura a ${year.year}` : 'Copiar estructura'}
      description="Crea en este año las secciones y los cursos de un año anterior. Se hace una sola vez, con el año aún sin secciones."
      crumbs={[
        CRUMB_ROOT,
        year
          ? {
              href: `/admin/estructura/anios/${encodeURIComponent(year.id)}`,
              label: String(year.year),
            }
          : { label: 'Año' },
        { label: 'Copiar estructura' },
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
  let sectionTotal: number;
  let candidates: SourceCandidate[];
  try {
    const [target, sections, years] = await Promise.all([
      getYear(anioId),
      listSections(anioId),
      listYears(),
    ]);
    year = target;
    sectionTotal = sections.total;
    const previous = previousYears(years.items, target);
    candidates = await Promise.all(
      previous.map(async (y) => ({
        id: y.id,
        year: y.year,
        activeSections: (await listSections(y.id)).items.filter((s) => s.isActive).length,
      })),
    );
  } catch (error) {
    return (
      <>
        {header()}
        <LoadError error={error} backHref="/admin/estructura" />
      </>
    );
  }

  const { options, empty, defaultId } = sourceOptions(candidates);
  return (
    <>
      {header(year)}
      <CloneStructure
        targetId={year.id}
        targetYear={year.year}
        options={options}
        emptyYears={empty}
        defaultSourceId={defaultId}
        blockReason={cloneBlockReason(year, sectionTotal)}
      />
    </>
  );
}
