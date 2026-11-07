'use client';

// B1 (Dev 1, RF-08): lista "Mis cursos" del sidebar. Client solo para marcar el enlace activo.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import type { Role } from '@/lib/roles';
import { isCourseActive, type NavLinkItem } from './course-nav-model';

export const EMPTY_TEXT = 'No tienes cursos asignados en el año activo';
export const EMPTY_TEXT_TEACHER = `${EMPTY_TEXT}. Consulta con el administrador.`;
export const ERROR_TEXT = 'No se pudieron cargar tus cursos. Recarga la página.';

export function MyCoursesList({
  items,
  error,
  role,
}: {
  items: NavLinkItem[];
  error: boolean;
  role?: Role;
}) {
  const pathname = usePathname();
  return <MyCoursesListView items={items} error={error} pathname={pathname} role={role} />;
}

export function MyCoursesListView({
  items,
  error,
  pathname,
  role,
}: {
  items: NavLinkItem[];
  error: boolean;
  pathname: string | null;
  role?: Role;
}) {
  if (error) {
    return (
      <p role="alert" className="px-2 py-1 text-xs text-sidebar-foreground">
        {ERROR_TEXT}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-sidebar-foreground/70">
        {role === 'TEACHER' ? EMPTY_TEXT_TEACHER : EMPTY_TEXT}
      </p>
    );
  }
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isCourseActive(pathname, item.key);
        return (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton
              className="h-11 md:h-8"
              isActive={active}
              render={
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                />
              }
            >
              <span className="truncate">{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
