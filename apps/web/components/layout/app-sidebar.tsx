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
import { LogoutButton } from '@/components/layout/logout-button';
import { NAV_BY_ROLE } from '@/lib/nav';
import { ROLE_LABELS, type Role } from '@/lib/roles';

export function AppSidebar({ role }: { role: Role }) {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="px-2 py-1">
          <span className="block text-base font-semibold">Aula Virtual</span>
          <span className="block text-xs text-sidebar-foreground/70">{ROLE_LABELS[role]}</span>
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
      </SidebarContent>
      <SidebarFooter>
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
