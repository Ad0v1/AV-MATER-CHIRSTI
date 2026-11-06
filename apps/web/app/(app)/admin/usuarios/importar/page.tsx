// /admin/usuarios/importar — importación masiva de usuarios desde Excel o CSV (RF-21). Solo ADMIN
// (lo exige la API). La pantalla es de cliente: sube el archivo al puente
// `importar/archivo/[accion]` (Route Handler), que lo reenvía a la API sin guardarlo.
import { PageHeader, PageShell } from '../../_shared/components/page-bits';
import { USERS_PATH } from '../_lib/users';
import { ImportScreen } from './_components/import-screen';

export const metadata = { title: 'Importar usuarios' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Importar usuarios"
        description="Crea estudiantes, docentes o apoderados desde una plantilla Excel o CSV. Primero se valida el archivo; nada se crea hasta que confirmes."
        crumbs={[{ href: USERS_PATH, label: 'Usuarios' }, { label: 'Importar' }]}
      />
      <ImportScreen />
    </PageShell>
  );
}
