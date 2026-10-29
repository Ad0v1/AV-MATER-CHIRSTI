// /admin/usuarios/nuevo/estudiante — alta de estudiante con matrícula en una sección activa del
// año activo (RF-18). Solo ADMIN (lo exige la API).
import { Suspense } from 'react';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  ReadOnlyNotice,
} from '../../../_shared/components/page-bits';
import { NewStudentForm } from '../../_components/new-user-forms';
import { getActiveYearSections } from '../../_lib/data';
import type { ActiveYearSections } from '../../_lib/types';
import { USERS_PATH, enrollTargets } from '../../_lib/users';

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Nuevo estudiante"
        description="Crea la cuenta y la matrícula en el año activo a la vez."
        crumbs={[{ href: USERS_PATH, label: 'Usuarios' }, { label: 'Nuevo estudiante' }]}
      />
      <Suspense fallback={<LoadingBlock rows={4} label="Cargando las secciones…" />}>
        <FormWithSections />
      </Suspense>
    </PageShell>
  );
}

async function FormWithSections() {
  let active: ActiveYearSections | null;
  try {
    active = await getActiveYearSections();
  } catch (error) {
    return <LoadError error={error} backHref={USERS_PATH} />;
  }
  if (!active) {
    return (
      <ReadOnlyNotice title="No hay año activo">
        Para matricular estudiantes, primero activa un año académico en Estructura académica.
      </ReadOnlyNotice>
    );
  }
  if (enrollTargets(active.sections).length === 0) {
    return (
      <ReadOnlyNotice title="Sin secciones activas">
        El año {active.year} no tiene secciones activas. Crea o activa una en Estructura académica.
      </ReadOnlyNotice>
    );
  }
  return <NewStudentForm sections={active.sections} year={active.year} />;
}
