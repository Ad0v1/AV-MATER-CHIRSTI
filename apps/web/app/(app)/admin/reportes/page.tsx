// /admin/reportes — reportes institucionales (RF-57..60). Solo ADMIN (layout de /admin y la API).
// - RF-57: cursos-sección del año con su docente y enlace a su registro (pantalla de Dev 4).
// - RF-58: Excel o PDF de un curso-sección y período (trabajo en segundo plano con descarga).
// - RF-59: ZIP con un archivo por curso-sección del año y período.
// - RF-60: dashboard por grado y sección (tablas; sin promedio anual, D-014).
// Los filtros viajan en la URL (?anio, ?periodo, ?nivel, ?grado, ?seccion): son ids o códigos.
// Tres niveles (09/11/2026): INICIAL y PRIMARIA usan escala literal (logro del bimestre, sin
// promedio); SECUNDARIA, promedio 0-20. El resumen muestra una tabla por escala.
import Form from 'next/form';
import Link from 'next/link';
import { ApiError } from '@/lib/api/errors';
import { Suspense } from 'react';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  Section,
} from '../_shared/components/page-bits';
import { SubmitButton } from '../_shared/components/form-bits';
import { gradeLabel, LEVEL_LABELS, sectionLabel } from '../estructura/_lib/levels';
import { ExportButton } from './_components/export-button';
import { getReportCourseSections, getReportsDashboard } from './_lib/data';
import {
  averageText,
  type DashboardBucket,
  distributionTotal,
  FORMAT_LABEL,
  gradebookHref,
  gradeLevels,
  levelsOf,
  literalMeaning,
  parseFilters,
  percent,
  pickPeriod,
  type EducationLevel,
  type ReportCourseSectionsView,
  type ReportFilters,
  type ReportFormat,
  REPORTS_PATH,
  type ReportsDashboardView,
} from './_lib/reports';

export const metadata = { title: 'Reportes' };

const FORMATS: ReportFormat[] = ['XLSX', 'PDF'];
const SELECT_CLASS = 'h-11 w-full rounded-md border bg-background px-3 text-sm md:h-9';

export default function Page({ searchParams }: PageProps<'/admin/reportes'>) {
  return (
    <PageShell>
      <PageHeader
        title="Reportes"
        description="Registro de cualquier curso, exportaciones en Excel o PDF y resumen del período por grado y sección."
      />
      <Suspense fallback={<LoadingBlock rows={6} label="Cargando reportes…" />}>
        <ReportsView searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function ReportsView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  let view: ReportCourseSectionsView;
  try {
    view = await getReportCourseSections(filters);
  } catch (error) {
    return <LoadError error={error} />;
  }
  if (!view.academicYear) {
    return <p className="text-sm text-muted-foreground">Todavía no hay años escolares.</p>;
  }
  const year = view.academicYear;
  const periodId = pickPeriod(filters.periodId, view.periods);
  const period = view.periods.find((p) => p.id === periodId) ?? null;
  return (
    <>
      <Section id="filtros" title="Filtros">
        <Filters view={view} filters={filters} periodId={periodId} />
      </Section>

      {period ? null : (
        <p role="note" className="text-sm text-muted-foreground">
          El año {year.year} todavía no tiene períodos: sin período no se pueden exportar registros
          ni ver el resumen. Créalos en Estructura académica.
        </p>
      )}

      {period ? (
        <Section
          id="todas"
          title="Todas las secciones"
          description={`Un ZIP con un archivo por curso y sección de ${year.year}, ${period.label}. Vence a los 7 días; la solicitud y la descarga quedan en la bitácora.`}
        >
          <div className="flex flex-wrap gap-3">
            {FORMATS.map((format) => (
              <ExportButton
                key={format}
                variant="default"
                request={{
                  type: 'BULK_EXPORT',
                  academicYearId: year.id,
                  periodId: period.id,
                  format,
                }}
                label={`ZIP de todas las secciones (${FORMAT_LABEL[format]})`}
                accessibleLabel={`ZIP de todas las secciones (${FORMAT_LABEL[format]}), ${year.year}, ${period.label}`}
                downloadLabel={`Descargar ZIP de todas las secciones (${FORMAT_LABEL[format]})`}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        id="secciones"
        title="Cursos por sección"
        description="Con su docente y su registro."
      >
        <CourseSectionList view={view} periodId={periodId} periodLabel={period?.label ?? null} />
      </Section>

      {period ? (
        <Section
          id="resumen"
          title={`Resumen de ${period.label}`}
          description="Promedios (secundaria) o logros del bimestre (inicial y primaria) con el motor de notas, estudiantes en riesgo y entregas. Sin nombres."
        >
          <Suspense
            key={`${year.id}-${period.id}-${filters.level ?? 'todos'}-${filters.gradeLevel ?? 'todos'}`}
            fallback={<LoadingBlock rows={4} label="Cargando resumen…" />}
          >
            <Dashboard
              yearId={year.id}
              periodId={period.id}
              level={filters.level}
              gradeLevel={filters.gradeLevel}
            />
          </Suspense>
        </Section>
      ) : null}
    </>
  );
}

function Filters({
  view,
  filters,
  periodId,
}: {
  view: ReportCourseSectionsView;
  filters: ReportFilters;
  periodId: string | null;
}) {
  return (
    <Form
      action={REPORTS_PATH}
      aria-label="Filtrar reportes"
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="anio" className="text-sm font-medium">
          Año escolar
        </label>
        <select id="anio" name="anio" defaultValue={view.academicYear?.id} className={SELECT_CLASS}>
          {view.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.year}
              {y.isActive ? ' (activo)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="periodo" className="text-sm font-medium">
          Período
        </label>
        <select id="periodo" name="periodo" defaultValue={periodId ?? ''} className={SELECT_CLASS}>
          {view.periods.length === 0 ? <option value="">Sin períodos</option> : null}
          {view.periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nivel" className="text-sm font-medium">
          Nivel
        </label>
        <select id="nivel" name="nivel" defaultValue={filters.level ?? ''} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {levelsOf(view.sections).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="grado" className="text-sm font-medium">
          Grado
        </label>
        <select
          id="grado"
          name="grado"
          defaultValue={filters.gradeLevel === null ? '' : String(filters.gradeLevel)}
          aria-describedby={filters.level ? undefined : 'grado-ayuda'}
          className={SELECT_CLASS}
        >
          <option value="">Todos</option>
          {filters.level
            ? gradeLevels(view.sections, filters.level).map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(filters.level as EducationLevel, g)}
                </option>
              ))
            : null}
        </select>
        {filters.level ? null : (
          <span id="grado-ayuda" className="text-xs text-muted-foreground">
            Elige un nivel y pulsa «Filtrar» para ver sus grados.
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seccion" className="text-sm font-medium">
          Sección
        </label>
        <select
          id="seccion"
          name="seccion"
          defaultValue={filters.sectionId ?? ''}
          className={SELECT_CLASS}
        >
          <option value="">Todas</option>
          {view.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {sectionLabel(s.level, s.gradeLevel, s.code)}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Filtrando…">Filtrar</SubmitButton>
    </Form>
  );
}

function CourseSectionList({
  view,
  periodId,
  periodLabel,
}: {
  view: ReportCourseSectionsView;
  periodId: string | null;
  periodLabel: string | null;
}) {
  if (view.items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>No hay cursos con estos filtros.</p>
        <p>
          Prueba con otro nivel, grado o sección, o elige «Todos» y «Todas» y vuelve a filtrar. Si
          el año es nuevo, puede que aún no tenga cursos asignados.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
      {view.items.map((cs) => {
        const name = `${cs.course.name} ${sectionLabel(cs.section.level, cs.section.gradeLevel, cs.section.code)}`;
        return (
          <li
            key={cs.courseSectionId}
            className="flex flex-col gap-3 p-3 lg:flex-row lg:items-start lg:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium break-words">{name}</span>
              <span className="text-sm text-muted-foreground break-words">
                {cs.teacher ? `Docente: ${cs.teacher.fullName}` : 'Sin docente asignado'}
                {cs.isActive ? '' : ' · Inactivo'}
              </span>
              <Link
                href={gradebookHref(cs.courseSectionId, periodId)}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 md:min-h-0"
              >
                Ver registro de {name}
              </Link>
            </div>
            {periodId && periodLabel ? (
              <div className="flex flex-wrap gap-3">
                {FORMATS.map((format) => (
                  <ExportButton
                    key={format}
                    request={{
                      type: 'SECTION_EXPORT',
                      courseSectionId: cs.courseSectionId,
                      periodId,
                      format,
                    }}
                    label={FORMAT_LABEL[format]}
                    accessibleLabel={`${FORMAT_LABEL[format]} del registro de ${name}, ${periodLabel}`}
                    downloadLabel={`Descargar ${FORMAT_LABEL[format]} del registro de ${name}`}
                  />
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

type DashRow = { key: string; label: string; bucket: DashboardBucket; strong?: boolean };

function rowsFor(view: ReportsDashboardView, scale: 'NUMERIC_0_20' | 'LITERAL_ADABC'): DashRow[] {
  const rows: DashRow[] = [];
  for (const g of view.grades) {
    if (g.gradingScale !== scale) continue;
    rows.push({ key: `g-${g.level}-${g.gradeLevel}`, label: g.label, bucket: g, strong: true });
    for (const s of g.sections) rows.push({ key: s.sectionId, label: s.label, bucket: s });
  }
  const total = view.totalByScale[scale];
  if (rows.length > 0 && total) {
    rows.push({ key: `total-${scale}`, label: 'Total', bucket: total, strong: true });
  }
  return rows;
}

function RowHeader({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <th scope="row" className={strong ? 'p-3 font-semibold' : 'p-3 pl-6 font-normal'}>
      {label}
    </th>
  );
}

function CountCell({ n, total }: { n: number; total: number }) {
  return (
    <td className="p-3 text-right">
      {n} <span className="text-muted-foreground">({percent(n, total)})</span>
    </td>
  );
}

async function Dashboard({
  yearId,
  periodId,
  level,
  gradeLevel,
}: {
  yearId: string;
  periodId: string;
  level: EducationLevel | null;
  gradeLevel: number | null;
}) {
  let view: ReportsDashboardView;
  try {
    view = await getReportsDashboard(yearId, periodId, level, gradeLevel);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'REPORT_NEEDS_GRADE_FILTER') {
      return (
        <p role="note" className="text-sm">
          Este año tiene muchos cursos: elige un nivel y un grado en los{' '}
          <a href="#nivel" className="font-medium underline underline-offset-4">
            filtros
          </a>{' '}
          y pulsa «Filtrar» para ver el resumen.
        </p>
      );
    }
    return <LoadError error={error} />;
  }
  if (view.grades.length === 0) {
    return <p className="text-sm text-muted-foreground">Este año no tiene cursos con secciones.</p>;
  }
  const numericRows = rowsFor(view, 'NUMERIC_0_20');
  const literalRows = rowsFor(view, 'LITERAL_ADABC');
  const allRows: DashRow[] = [];
  for (const g of view.grades) {
    allRows.push({ key: `g-${g.level}-${g.gradeLevel}`, label: g.label, bucket: g, strong: true });
    for (const s of g.sections) allRows.push({ key: s.sectionId, label: s.label, bucket: s });
  }
  allRows.push({ key: 'total', label: 'Total', bucket: view.total, strong: true });
  const caption = `${view.period.label} ${view.academicYear.year}`;
  return (
    <div className="flex flex-col gap-6">
      {literalRows.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Inicial y primaria: escala literal sin promedio. Se cuenta el logro del bimestre que
            eligió el docente por estudiante y curso. En riesgo: logro{' '}
            {view.achievementRiskLiteral ?? '—'} (estudiantes distintos).
          </p>
          <div
            className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"
            tabIndex={0}
            role="region"
            aria-labelledby="tabla-logros"
          >
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption id="tabla-logros" className="p-3 text-left font-medium">
                Logros del bimestre (inicial y primaria), {caption}
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Grado o sección
                  </th>
                  {view.achievementLiterals.map((l) => (
                    <th key={l} scope="col" className="p-3 text-right font-medium">
                      {l}
                    </th>
                  ))}
                  <th scope="col" className="p-3 text-right font-medium">
                    Sin logro
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    En riesgo
                  </th>
                </tr>
              </thead>
              <tbody>
                {literalRows.map(({ key, label, bucket, strong }) => {
                  const total = distributionTotal(bucket);
                  return (
                    <tr key={key} className={strong ? 'border-t bg-muted/20' : 'border-t'}>
                      <RowHeader label={label} strong={strong} />
                      {view.achievementLiterals.map((l) => (
                        <CountCell key={l} n={bucket.achievements[l] ?? 0} total={total} />
                      ))}
                      <td className="p-3 text-right">{bucket.noGrades}</td>
                      <td className="p-3 text-right">
                        {bucket.atRiskStudents} de {bucket.students}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {numericRows.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Secundaria: la distribución cuenta promedios de estudiante por curso. En riesgo:
            promedio con literal {view.riskLiteral ?? '—'} (estudiantes distintos).
          </p>
          <div
            className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"
            tabIndex={0}
            role="region"
            aria-labelledby="tabla-promedios"
          >
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption id="tabla-promedios" className="p-3 text-left font-medium">
                Promedios y distribución por literal (secundaria), {caption}
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Grado o sección
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    Promedio
                  </th>
                  {view.literals.map((l) => (
                    <th key={l} scope="col" className="p-3 text-right font-medium">
                      {l}
                    </th>
                  ))}
                  <th scope="col" className="p-3 text-right font-medium">
                    Sin notas
                  </th>
                  <th scope="col" className="p-3 text-right font-medium">
                    En riesgo
                  </th>
                </tr>
              </thead>
              <tbody>
                {numericRows.map(({ key, label, bucket, strong }) => {
                  const total = distributionTotal(bucket);
                  return (
                    <tr key={key} className={strong ? 'border-t bg-muted/20' : 'border-t'}>
                      <RowHeader label={label} strong={strong} />
                      <td className="p-3 text-right">{averageText(bucket.average)}</td>
                      {view.literals.map((l) => (
                        <CountCell key={l} n={bucket.distribution[l] ?? 0} total={total} />
                      ))}
                      <td className="p-3 text-right">{bucket.noGrades}</td>
                      <td className="p-3 text-right">
                        {bucket.atRiskStudents} de {bucket.students}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <dl aria-label="Leyenda de literales" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[...new Set([...view.achievementLiterals, ...view.literals])].map((l) => (
          <div key={l} className="flex gap-1">
            <dt className="font-medium">{l}:</dt>
            <dd>{literalMeaning(l)}</dd>
          </div>
        ))}
      </dl>

      <div
        className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"
        tabIndex={0}
        role="region"
        aria-labelledby="tabla-entregas"
      >
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption id="tabla-entregas" className="p-3 text-left font-medium">
            Entregas a tiempo, tarde y NE, {caption}
          </caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Grado o sección
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                A tiempo
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                Tarde
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                NE
              </th>
            </tr>
          </thead>
          <tbody>
            {allRows.map(({ key, label, bucket, strong }) => (
              <tr key={key} className={strong ? 'border-t bg-muted/20' : 'border-t'}>
                <RowHeader label={label} strong={strong} />
                <td className="p-3 text-right">{bucket.counts.onTime}</td>
                <td className="p-3 text-right">{bucket.counts.late}</td>
                <td className="p-3 text-right">{bucket.counts.ne}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
