// /admin/usuarios/importar — importación masiva de usuarios desde Excel o CSV (RF-21). Solo ADMIN
// (lo exige la API). La pantalla es de cliente: sube el archivo al puente
// `importar/archivo/[accion]` (Route Handler), que lo reenvía a la API sin guardarlo.
import { PageHeader, PageShell } from '../../_shared/components/page-bits';
import { ROUTE_META } from '@/lib/route-meta';
import { ImportScreen } from './_components/import-screen';

export const metadata = { title: 'Importar usuarios' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/usuarios/importar'].title}
        description={ROUTE_META['/admin/usuarios/importar'].description}
        crumbs={ROUTE_META['/admin/usuarios/importar'].crumbs}
      />
      <ImportScreen />
    </PageShell>
  );
}
