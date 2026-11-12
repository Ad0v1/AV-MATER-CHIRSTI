// /admin/almacenamiento — uso del almacenamiento (RF-67), respaldos anuales con su descarga
// (RF-65), aviso previo a la purga (RF-66, U7) y exportación de datos personales (RF-63). Solo
// ADMIN (layout de /admin y la API). La purga no tiene botón: es automática e irreversible.
import Form from 'next/form';
import { Suspense } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  Section,
} from '../_shared/components/page-bits';
import { SubmitButton } from '../_shared/components/form-bits';
import { formatInstant, sectionLabel } from '../_shared/lib/format';
import { JobDownloadButton } from './_components/job-download-button';
import { PersonalDataExport } from './_components/personal-data-export';
import { getStorageUsage, getYearBackups } from './_lib/data';
import {
  formatBytes,
  jobStatusText,
  pickYear,
  purgeNotice,
  PURGE_STATE_LABELS,
  STORAGE_PATH,
  type StorageUsageView,
  type YearBackupsView,
} from './_lib/storage';

export const metadata = { title: 'Almacenamiento' };

export default function Page({ searchParams }: PageProps<'/admin/almacenamiento'>) {
  return (
    <PageShell>
      <PageHeader
        title="Almacenamiento"
        description="Espacio usado por los PDF, respaldos de cada año y exportación de datos personales."
      />
      <Suspense fallback={<LoadingBlock rows={5} label="Cargando almacenamiento…" />}>
        <StorageView searchParams={searchParams} />
      </Suspense>
      <Section
        id="datos-personales"
        title="Datos personales de un estudiante"
        description="Para atender un pedido de acceso (derecho ARCO). Genera un ZIP con sus datos, matrículas, entregas y notas; vence a los 7 días. La solicitud y la descarga quedan en la bitácora."
      >
        <PersonalDataExport />
      </Section>
    </PageShell>
  );
}

async function StorageView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let usage: StorageUsageView;
  try {
    usage = await getStorageUsage();
  } catch (error) {
    return <LoadError error={error} />;
  }
  const yearId = pickYear(params.anio, usage.years);
  return (
    <>
      <Section id="uso" title="Uso del almacenamiento" description="PDF sin purgar.">
        <UsageSummary usage={usage} />
      </Section>
      {yearId ? (
        <Section id="respaldos" title="Respaldos y purga por año">
          <YearPicker usage={usage} yearId={yearId} />
          <Suspense key={yearId} fallback={<LoadingBlock rows={3} label="Cargando respaldos…" />}>
            <Backups yearId={yearId} usage={usage} />
          </Suspense>
        </Section>
      ) : null}
    </>
  );
}

function UsageSummary({ usage }: { usage: StorageUsageView }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Total: <strong>{formatBytes(usage.total.bytes)}</strong> en {usage.total.files}{' '}
        {usage.total.files === 1 ? 'archivo' : 'archivos'}.
      </p>
      {usage.years.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay años escolares.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">Uso por año escolar</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Año
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  PDF
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  Archivos
                </th>
                <th scope="col" className="p-3 text-right font-medium">
                  Respaldos
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.years.map((y) => (
                <tr key={y.academicYearId} className="border-t">
                  <th scope="row" className="p-3 font-medium">
                    {y.year}
                    {y.closedAt ? (
                      <span className="font-normal text-muted-foreground"> (cerrado)</span>
                    ) : null}
                  </th>
                  <td className="p-3 text-right">{formatBytes(y.bytes)}</td>
                  <td className="p-3 text-right">{y.files}</td>
                  <td className="p-3 text-right">{formatBytes(y.backupBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function YearPicker({ usage, yearId }: { usage: StorageUsageView; yearId: string }) {
  if (usage.years.length < 2) return null;
  return (
    <Form action={STORAGE_PATH} aria-label="Elegir año" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="anio" className="text-sm font-medium">
          Año escolar
        </label>
        <select
          id="anio"
          name="anio"
          defaultValue={yearId}
          className="h-11 rounded-md border bg-background px-3 text-sm md:h-9"
        >
          {usage.years.map((y) => (
            <option key={y.academicYearId} value={y.academicYearId}>
              {y.year}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Cargando…">Ver año</SubmitButton>
    </Form>
  );
}

const NOTICE_CLASS = {
  info: '',
  warning: 'border-amber-700 dark:border-amber-400',
  danger: '',
} as const;

async function Backups({ yearId, usage }: { yearId: string; usage: StorageUsageView }) {
  let view: YearBackupsView;
  try {
    view = await getYearBackups(yearId);
  } catch (error) {
    return <LoadError error={error} />;
  }
  const notice = purgeNotice(view, new Date(), formatInstant);
  const grades = usage.grades.filter((g) => g.academicYearId === yearId);
  return (
    <div className="flex flex-col gap-4">
      <Alert
        variant={notice.tone === 'danger' ? 'destructive' : 'default'}
        role={notice.tone === 'info' ? 'note' : 'status'}
        className={cn(NOTICE_CLASS[notice.tone])}
      >
        <AlertTitle>{notice.title}</AlertTitle>
        <AlertDescription>
          <p>{notice.body}</p>
          <p className="mt-1 text-xs">
            Estado: {PURGE_STATE_LABELS[view.purge.state]} · Plazo tras el cierre:{' '}
            {view.purge.purgeAfterDays} días (se cambia en Configuración).
          </p>
        </AlertDescription>
      </Alert>

      {grades.length > 0 ? (
        <div className="text-sm text-muted-foreground">
          <p id="uso-por-grado">Uso por grado:</p>
          <ul aria-labelledby="uso-por-grado" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {grades.map((g) => (
              <li key={g.gradeLevel}>
                {g.gradeLevel}.º: {formatBytes(g.bytes)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este año no tiene secciones.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
          {view.sections.map((s) => {
            const label = sectionLabel(s.gradeLevel, s.code);
            const b = s.backup;
            return (
              <li
                key={s.sectionId}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{label}</span>
                  <span className="text-sm text-muted-foreground">
                    {jobStatusText(b)}
                    {b?.status === 'SUCCEEDED' && b.resultBytes !== null
                      ? ` · ${formatBytes(b.resultBytes)}`
                      : ''}
                    {b?.finishedAt ? ` · ${formatInstant(b.finishedAt)}` : ''}
                  </span>
                </div>
                {b?.status === 'SUCCEEDED' && b.hasResult ? (
                  <JobDownloadButton
                    jobId={b.id}
                    label="Descargar ZIP"
                    accessibleLabel={`Descargar ZIP del respaldo ${view.academicYear.year} de ${label}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
