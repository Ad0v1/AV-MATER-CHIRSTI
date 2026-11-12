// /admin/usuarios/nuevo/apoderado — alta de apoderado con 1 a 10 estudiantes (RF-19, RF-25).
// Solo ADMIN (lo exige la API).
import { PageHeader, PageShell } from '../../../_shared/components/page-bits';
import { ROUTE_META } from '@/lib/route-meta';
import { NewGuardianForm } from '../../_components/new-user-forms';

export const metadata = { title: 'Nuevo apoderado' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/usuarios/nuevo/apoderado'].title}
        description={ROUTE_META['/admin/usuarios/nuevo/apoderado'].description}
        crumbs={ROUTE_META['/admin/usuarios/nuevo/apoderado'].crumbs}
      />
      <NewGuardianForm />
    </PageShell>
  );
}
