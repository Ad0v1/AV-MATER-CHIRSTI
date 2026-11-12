// /admin/bitacora — bitácora de solo lectura (RF-62; modo soporte RF-55/56, U9). Solo ADMIN (el
// layout de /admin y la API). Filtros en la URL; 50 filas por página.
import Link from 'next/link';
import { Suspense } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadError, LoadingBlock, PageHeader, PageShell } from '../_shared/components/page-bits';
import { PageNav, pageControlClass } from '../usuarios/_components/user-list';
import { AuditFilters } from './_components/audit-filters';
import { AuditTable } from './_components/audit-table';
import {
  type AuditFilters as Filters,
  type AuditLogPage,
  auditHref,
  parseAuditFilters,
  rangeError,
  rangeText,
} from './_lib/audit';
import { listAuditLogs } from './_lib/data';

export const metadata = { title: 'Bitácora' };

export default function Page({ searchParams }: PageProps<'/admin/bitacora'>) {
  return (
    <PageShell>
      <PageHeader
        title="Bitácora"
        description="Quién hizo qué y cuándo. No se puede editar ni borrar. «Modo soporte» marca a un administrador que actuó en contenidos, entregas o notas."
      />
      <Suspense fallback={<LoadingBlock rows={6} label="Cargando bitácora…" />}>
        <AuditView searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function AuditView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAuditFilters(await searchParams);
  const invalid = rangeError(filters);
  if (invalid) {
    return (
      <>
        <AuditFilters key={auditHref(filters)} filters={filters} dateError={invalid} />
        <Alert variant="destructive">
          <AlertDescription>No se muestran registros: {invalid}</AlertDescription>
        </Alert>
      </>
    );
  }
  let data: AuditLogPage;
  try {
    data = await listAuditLogs(filters);
  } catch (error) {
    return (
      <>
        <AuditFilters key={auditHref(filters)} filters={filters} />
        <LoadError error={error} />
      </>
    );
  }
  const actorName = filters.actorId
    ? data.items.find((i) => i.actor?.id === filters.actorId)?.actor?.fullName
    : undefined;
  return (
    <>
      <AuditFilters key={auditHref(filters)} filters={filters} actorName={actorName} />
      <Results data={data} filters={filters} />
    </>
  );
}

function Results({ data, filters }: { data: AuditLogPage; filters: Filters }) {
  return (
    <section aria-labelledby="registros-titulo" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="registros-titulo" className="text-lg font-semibold">
          Registros
        </h2>
        <p className="text-sm text-muted-foreground">
          {rangeText(data.page, data.pageSize, data.total, data.items.length)}
        </p>
      </div>
      <AuditTable items={data.items} filters={filters} />
      <PageNav
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        renderControl={(target, label, rel) => (
          <Link href={auditHref(filters, { page: target })} rel={rel} className={pageControlClass}>
            {label}
          </Link>
        )}
      />
    </section>
  );
}
