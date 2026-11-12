// /admin/usuarios — lista de usuarios con filtros y paginación (RF-22). Solo ADMIN (lo exige la
// API). Los filtros van en la URL; la búsqueda por nombre o correo va por Server Action (POST)
// para que el texto no quede en la URL ni en el historial (decisión de seguridad 3 de 5a).
//
// Carga: el encabezado (título, descripción y acciones) es estático y sale al instante. Dentro de
// la página, el buscador y los filtros se pintan en cuanto se leen los parámetros de la URL; las
// secciones del año activo (que solo usa el filtro de sección) y la lista llegan después, cada una
// por su lado, sin bloquear al resto.
import Link from 'next/link';
import { Suspense } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ROUTE_META } from '@/lib/route-meta';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadingBlock, PageHeader, PageShell } from '../_shared/components/page-bits';
import { TOUCH } from '../_shared/components/styles';
import { NewUserMenu } from './_components/new-user-menu';
import { UsersExplorer } from './_components/users-explorer';
import { getActiveYearSections, listUsers } from './_lib/data';
import type { SectionOption, UserListPage } from './_lib/types';
import { USERS_PATH, parseUserFilters } from './_lib/users';

export const metadata = { title: 'Usuarios' };

export default function Page({ searchParams }: PageProps<'/admin/usuarios'>) {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/usuarios'].title}
        description={ROUTE_META['/admin/usuarios'].description}
        actions={
          <>
            <Link
              href={`${USERS_PATH}/importar`}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                TOUCH,
                'gap-2 px-3 text-ink-2 hover:bg-foreground/5 hover:text-foreground md:min-h-9',
              )}
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Importar desde Excel
            </Link>
            <NewUserMenu />
          </>
        }
      />
      <Suspense fallback={<LoadingBlock rows={6} label="Cargando usuarios…" />}>
        <UsersBody searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function UsersBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Sin pestaña elegida se ve la de Estudiantes: la lista nunca mezcla los roles.
  const filters = parseUserFilters({ ...params, role: params.role ?? 'STUDENT' });
  // Ambas cosas arrancan ya pero no se esperan aquí: el cliente las recibe como promesas.
  // Las secciones solo sirven para el filtro de sección; si fallan, todo lo demás funciona igual.
  const sections: Promise<SectionOption[]> = getActiveYearSections()
    .then((active) => active?.sections ?? [])
    .catch(() => []);
  // Primera página para pintar ya con datos. Si falla, el cliente la pide por su cuenta.
  const initial: Promise<UserListPage | null> = listUsers(filters).catch(() => null);
  // Pestañas, filtros, búsqueda y paginación viven en el cliente (sin navegar al servidor).
  return <UsersExplorer initialFilters={filters} initial={initial} sections={sections} />;
}
