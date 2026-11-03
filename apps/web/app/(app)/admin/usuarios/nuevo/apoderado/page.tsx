// /admin/usuarios/nuevo/apoderado — alta de apoderado con 1 a 10 estudiantes (RF-19, RF-25).
// Solo ADMIN (lo exige la API).
import { PageHeader, PageShell } from '../../../_shared/components/page-bits';
import { NewGuardianForm } from '../../_components/new-user-forms';
import { USERS_PATH } from '../../_lib/users';

export const metadata = { title: 'Nuevo apoderado' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Nuevo apoderado"
        description="Crea la cuenta y la vincula con los estudiantes a su cargo en un solo paso."
        crumbs={[{ href: USERS_PATH, label: 'Usuarios' }, { label: 'Nuevo apoderado' }]}
      />
      <NewGuardianForm />
    </PageShell>
  );
}
