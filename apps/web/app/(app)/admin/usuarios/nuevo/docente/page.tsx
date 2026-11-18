// /admin/usuarios/nuevo/docente — alta de docente (RF-19). Solo ADMIN (lo exige la API).
import { PageHeader, PageShell } from '../../../_shared/components/page-bits';
import { ROUTE_META } from '@/lib/route-meta';
import { NewTeacherForm } from '../../_components/new-user-forms';

export const metadata = { title: 'Nuevo docente' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/usuarios/nuevo/docente'].title}
        description={ROUTE_META['/admin/usuarios/nuevo/docente'].description}
        crumbs={ROUTE_META['/admin/usuarios/nuevo/docente'].crumbs}
      />
      <NewTeacherForm />
    </PageShell>
  );
}
