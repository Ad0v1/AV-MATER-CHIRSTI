import { Suspense } from 'react';
import Link from 'next/link';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { BrandSkeleton, SchoolBrand } from '@/components/layout/school-brand';
import { MyCoursesNav, MyCoursesSkeleton } from '@/components/layout/my-courses-nav';
import { LogoutButton } from '@/components/layout/logout-button';
import { NAV_BY_ROLE } from '@/lib/nav';
import { ROLE_LABELS, type Role } from '@/lib/roles';

export function AppSidebar({ role }: { role: Role }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/"
          className="min-w-0 rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Suspense fallback={<BrandSkeleton subtitle={ROLE_LABELS[role]} />}>
            <SchoolBrand subtitle={ROLE_LABELS[role]} />
          </Suspense>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {NAV_BY_ROLE[role].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton render={<Link href={item.href} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <Suspense fallback={<MyCoursesSkeleton role={role} />}>
          <MyCoursesNav role={role} />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
