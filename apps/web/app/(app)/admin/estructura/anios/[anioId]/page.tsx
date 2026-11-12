// /admin/estructura/anios/[anioId] — año, períodos y secciones (RF-10..13, RF-15, RF-16; RN-10, RN-11).
import Link from 'next/link';
import { RouteLoading } from '@/components/layout/route-loading';
import { Suspense, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  LoadError,
  PageHeader,
  PageShell,
  ReadOnlyNotice,
  Section,
  StatusBadge,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { CreateSectionForm, SectionItem } from '../../_components/section-panels';
import { PeriodPanel, YearActions } from '../../_components/year-panels';
import { canOfferClone } from '../../_lib/clone';
import { getYear, listSections } from '../../_lib/data';
import { canOfferPromotion } from '../../_lib/promotion-machine';
import { FOCUS_HEADING, focusIds } from '../../_lib/focus';
import { formatInstant, yearStatus } from '../../_lib/format';
import type { List, SectionView, YearDetail } from '../../_lib/types';
import { isUuid } from '../../_lib/validation';
import type { EducationLevel } from '../../_lib/levels';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

const LEVEL_ORDER: Record<EducationLevel, number> = { INICIAL: 0, PRIMARIA: 1, SECUNDARIA: 2 };

export const metadata = { title: 'Año académico' };

export default function Page({ params }: PageProps<'/admin/estructura/anios/[anioId]'>) {
  return (
    <PageShell>
      <Suspense fallback={<RouteLoading bare />}>
        <YearView params={params} />
      </Suspense>
    </PageShell>
  );
}

const CRUMB_ROOT = { href: '/admin/estructura', label: 'Estructura académica' };

async function YearView({ params }: { params: Promise<{ anioId: string }> }) {
  const { anioId } = await params;
  if (!isUuid(anioId)) {
    return (
      <>
        <PageHeader title="Año académico" crumbs={[CRUMB_ROOT, { label: 'Año' }]} />
        <LoadError
          error={new ApiError(404, 'NOT_FOUND', 'El año académico no existe')}
          backHref="/admin/estructura"
        />
      </>
    );
  }
  let year: YearDetail;
  let sections: List<SectionView>;
  try {
    [year, sections] = await Promise.all([getYear(anioId), listSections(anioId)]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Año académico" crumbs={[CRUMB_ROOT, { label: 'Año' }]} />
        <LoadError error={error} backHref="/admin/estructura" />
      </>
    );
  }

  const status = yearStatus(year);
  const isClosed = !!year.closedAt;
  const openPeriods = year.periods.filter((p) => !p.closedAt).length;
  const sorted = [...sections.items].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      a.gradeLevel - b.gradeLevel ||
      a.code.localeCompare(b.code, 'es'),
  );

  return (
    <>
      <PageHeader
        title={`Año académico ${year.year}`}
        crumbs={[CRUMB_ROOT, { label: String(year.year) }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span>
              {status.detail}
              {year.closedAt ? ` Cerrado el ${formatInstant(year.closedAt)}.` : ''}
            </span>
          </span>
        }
      />
      {year.readOnly ? (
        <ReadOnlyNotice>
          Este año es de solo lectura (cerrado o anterior al año activo): no se pueden cambiar sus
          períodos, secciones ni cursos.
        </ReadOnlyNotice>
      ) : null}
      <YearActions
        yearId={year.id}
        year={year.year}
        isActive={year.isActive}
        isClosed={isClosed}
        readOnly={year.readOnly}
        openPeriods={openPeriods}
      />

      <Section
        id="periodos"
        title="Períodos"
        description="Con un período cerrado no se crean, editan ni califican actividades. Solo se reabren períodos del año activo."
      >
        <ol className="flex flex-col">
          {[...year.periods]
            .sort((a, b) => a.sequence - b.sequence)
            .map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 border-b border-line/60 py-5 first:pt-1 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <h3
                    id={focusIds.period(p.id)}
                    tabIndex={-1}
                    className={cn('text-base font-semibold', FOCUS_HEADING)}
                  >
                    {p.label}
                  </h3>
                  <StatusBadge tone={p.closedAt ? 'closed' : p.isOpen ? 'active' : 'inactive'}>
                    {p.closedAt ? 'Cerrado' : p.isOpen ? 'Abierto' : 'Sin cerrar'}
                  </StatusBadge>
                </div>
                <PeriodPanel
                  period={p}
                  closedAtText={formatInstant(p.closedAt)}
                  yearReadOnly={year.readOnly}
                  yearActive={year.isActive}
                />
              </li>
            ))}
        </ol>
      </Section>

      <Section
        id="secciones"
        title="Secciones"
        description={`${sections.total} ${sections.total === 1 ? 'sección' : 'secciones'} en ${year.year}.`}
      >
        {canOfferClone(year, sections.total) || canOfferPromotion(year, sections.items) ? (
          <div className="flex flex-col">
            {canOfferClone(year, sections.total) ? (
              <Shortcut
                href={`/admin/estructura/anios/${encodeURIComponent(year.id)}/clonar`}
                hint="Secciones y cursos, sin matrículas."
              >
                Copiar la estructura de un año anterior
              </Shortcut>
            ) : null}
            {canOfferPromotion(year, sections.items) ? (
              <Shortcut
                href={`/admin/estructura/anios/${encodeURIComponent(year.id)}/promocion`}
                hint="Propuesta que revisas y confirmas."
              >
                Promover estudiantes de {year.year - 1} a {year.year}
              </Shortcut>
            ) : null}
          </div>
        ) : null}
        {year.readOnly ? null : <CreateSectionForm yearId={year.id} />}
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este año aún no tiene secciones.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {sorted.map((s) => (
              <li key={s.id} className="border-b border-line/60 py-4 first:pt-1 last:border-b-0">
                <SectionItem
                  section={s}
                  yearId={year.id}
                  readOnly={year.readOnly}
                  badge={
                    <StatusBadge tone={s.isActive ? 'active' : 'inactive'}>
                      {s.isActive ? 'Activa' : 'Inactiva'}
                    </StatusBadge>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** Atajo hacia un asistente: enlace de texto con flecha y una frase que explica qué hace. */
function Shortcut({ href, hint, children }: { href: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <Link
        href={href}
        className="group/atajo inline-flex min-h-11 items-center md:min-h-9 gap-1.5 rounded-md text-sm font-medium text-brand hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
      >
        {children}
        <ArrowRight
          className="size-4 transition-transform group-hover/atajo:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </Link>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </div>
  );
}
