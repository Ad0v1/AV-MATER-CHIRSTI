// /admin/usuarios/nuevo/docente — alta de docente (RF-19). Solo ADMIN (lo exige la API).
import { PageHeader, PageShell } from '../../../_shared/components/page-bits';
import { NewTeacherForm } from '../../_components/new-user-forms';
import { USERS_PATH } from '../../_lib/users';

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Nuevo docente"
        description="Después podrás asignarlo a los cursos de cada sección en Estructura académica."
        crumbs={[{ href: USERS_PATH, label: 'Usuarios' }, { label: 'Nuevo docente' }]}
      />
      <NewTeacherForm />
    </PageShell>
  );
}
