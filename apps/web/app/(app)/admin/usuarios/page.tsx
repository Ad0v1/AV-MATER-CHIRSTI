// /admin/usuarios — lista de usuarios con filtros y paginación (RF-22). Solo ADMIN (lo exige la
// API). Los filtros van en la URL; la búsqueda por nombre o correo va por Server Action (POST)
// para que el texto no quede en la URL ni en el historial (decisión de seguridad 3 de 5a).
import Link from 'next/link';
import { Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadError, LoadingBlock, PageHeader, PageShell } from '../_shared/components/page-bits';
import { TOUCH } from '../_shared/components/styles';
import { PageNav, UserResults, pageControlClass } from './_components/user-list';
import { UserFilters } from './_components/user-filters';
import { UserSearch } from './_components/user-search';
import { getActiveYearSections, listUsers } from './_lib/data';
import type { SectionOption, UserListPage } from './_lib/types';
import {
  USERS_PATH,
  buildUserListQuery,
  listHref,
  parseUserFilters,
  rangeText,
  searchResetKey,
  type UserFilters as Filters,
} from './_lib/users';

const linkButton = (variant: 'default' | 'outline') =>
  cn(buttonVariants({ variant }), TOUCH, 'inline-flex items-center');

export const metadata = { title: 'Usuarios' };

export default function Page({ searchParams }: PageProps<'/admin/usuarios'>) {
  return (
    <PageShell>
      <PageHeader
        title="Usuarios"
        description="Estudiantes, docentes, administradores y apoderados. El rol de una cuenta no se puede cambiar."
        actions={
          <>
            <Link href={`${USERS_PATH}/nuevo/estudiante`} className={linkButton('default')}>
              Nuevo estudiante
            </Link>
            <Link href={`${USERS_PATH}/nuevo/docente`} className={linkButton('outline')}>
              Nuevo docente
            </Link>
            <Link href={`${USERS_PATH}/nuevo/apoderado`} className={linkButton('outline')}>
              Nuevo apoderado
            </Link>
            <Link href={`${USERS_PATH}/importar`} className={linkButton('outline')}>
              Importar desde Excel
            </Link>
          </>
        }
      />
      <Suspense fallback={<LoadingBlock rows={6} label="Cargando usuarios…" />}>
        <UsersView searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function UsersView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseUserFilters(await searchParams);
  // Las secciones solo sirven para el filtro: si fallan, la lista se muestra igual.
  let sections: SectionOption[] = [];
  try {
    sections = (await getActiveYearSections())?.sections ?? [];
  } catch {
    sections = [];
  }
  const key = buildUserListQuery(filters);
  return (
    <>
      <UserFilters key={key} filters={filters} sections={sections} />
      {/* key: al aplicar otros filtros se monta un buscador nuevo y se descartan los resultados
          de la búsqueda anterior (MEDIO de UX, INFORME 13). */}
      <UserSearch key={searchResetKey(filters)} filters={filters}>
        <ServerList filters={filters} />
      </UserSearch>
    </>
  );
}

async function ServerList({ filters }: { filters: Filters }) {
  let data: UserListPage;
  try {
    data = await listUsers(filters);
  } catch (error) {
    return <LoadError error={error} />;
  }
  return (
    <section aria-labelledby="lista-usuarios-titulo" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="lista-usuarios-titulo" className="text-lg font-semibold">
          Lista
        </h2>
        <p className="text-sm text-muted-foreground">
          {rangeText(data.page, data.pageSize, data.total, data.items.length)}
        </p>
      </div>
      <UserResults items={data.items} caption="Usuarios, por nombre" />
      <PageNav
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        renderControl={(target, label, rel) => (
          <Link href={listHref(filters, target)} rel={rel} className={pageControlClass}>
            {label}
          </Link>
        )}
      />
    </section>
  );
}
