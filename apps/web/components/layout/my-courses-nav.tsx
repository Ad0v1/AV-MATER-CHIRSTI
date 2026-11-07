// B1 (Dev 1, RF-08): grupo "Mis cursos" del sidebar con GET /me/course-sections (docs/03).
// Server Component con la sesion (BFF, D-037). Solo TEACHER y STUDENT: a ADMIN y GUARDIAN no se
// les pide nada ni se muestra el grupo. Si la API falla se muestra un aviso sin romper el menu.
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar';
import { apiServer } from '@/lib/api/server';
import type { Role } from '@/lib/roles';
import {
  hasMyCourses,
  myCourseItems,
  type MyCourseSection,
  type NavLinkItem,
} from './course-nav-model';
import { MyCoursesList } from './my-courses-list';

export async function loadMyCourses(
  role: Role,
): Promise<{ items: NavLinkItem[]; error: boolean } | null> {
  if (!hasMyCourses(role)) return null;
  try {
    const res = await apiServer.get<{ items: MyCourseSection[] }>('/me/course-sections');
    return { items: myCourseItems(role, Array.isArray(res?.items) ? res.items : []), error: false };
  } catch {
    return { items: [], error: true };
  }
}

export async function MyCoursesNav({ role }: { role: Role }) {
  const data = await loadMyCourses(role);
  if (!data) return null;
  return (
    <MyCoursesGroup>
      <MyCoursesList items={data.items} error={data.error} role={role} />
    </MyCoursesGroup>
  );
}

function MyCoursesGroup({ children }: { children: React.ReactNode }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Mis cursos</SidebarGroupLabel>
      <SidebarGroupContent>{children}</SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Esqueleto mientras cargan los cursos (solo para los roles que tienen el grupo). */
export function MyCoursesSkeleton({ role }: { role: Role }) {
  if (!hasMyCourses(role)) return null;
  return (
    <MyCoursesGroup>
      <div className="flex flex-col gap-1 px-2 py-1" aria-busy="true">
        <span className="sr-only">Cargando tus cursos…</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="block h-8 w-full animate-pulse rounded bg-sidebar-accent"
          />
        ))}
      </div>
    </MyCoursesGroup>
  );
}
