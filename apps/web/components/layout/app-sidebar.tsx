import { Suspense } from 'react';
import Link from 'next/link';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { BrandSkeleton, SchoolBrand } from '@/components/layout/school-brand';
import { MyCoursesNav, MyCoursesSkeleton } from '@/components/layout/my-courses-nav';
import { LogoutButton } from '@/components/layout/logout-button';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ROLE_LABELS, type Role } from '@/lib/roles';

// Sidebar de servidor: logo y nombre del colegio desde la configuración (A2) y "Mis cursos" (B1).
// El menú con la página activa es de cliente (SidebarNav). Estilos del diseño de David (PR #21).
export function AppSidebar({ role }: { role: Role }) {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          aria-label="Aula Virtual Mater Christi"
          className="flex min-h-14 min-w-0 items-center rounded-xl px-1.5 py-1 transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
        >
          <Suspense fallback={<BrandSkeleton subtitle={ROLE_LABELS[role]} />}>
            <SchoolBrand subtitle={ROLE_LABELS[role]} />
          </Suspense>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2 py-4">
        <SidebarNav role={role} />
        <Suspense fallback={<MyCoursesSkeleton role={role} />}>
          <MyCoursesNav role={role} />
        </Suspense>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-1">
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
