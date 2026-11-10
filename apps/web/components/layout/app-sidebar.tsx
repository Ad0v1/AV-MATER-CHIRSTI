'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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
import { HOME_BY_ROLE, ROLE_LABELS, type Role } from '@/lib/roles';

const isActiveRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-0">
        <Link
          href={HOME_BY_ROLE[role]}
          aria-label="Aula Virtual Mater Christi"
          className="group/brand flex min-h-14 items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring group-data-[collapsible=icon]:justify-center"
        >
          <span className="grid size-11 shrink-0 place-items-center group-data-[collapsible=icon]:size-8">
            <Image
              src="/brand/escudo.webp"
              alt=""
              width={38}
              height={44}
              priority
              className="h-11 w-10 object-contain group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-6"
            />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[0.68rem] font-bold tracking-[0.16em] text-white/65 uppercase">
              Mater Christi
            </span>
            <span className="mt-0.5 block truncate font-heading text-base font-semibold tracking-tight text-white">
              Aula Virtual
            </span>
            <span className="sr-only">{ROLE_LABELS[role]}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2 py-4">
        {NAV_BY_ROLE[role].map((group) => (
          <SidebarGroup key={group.label} className="px-1.5 py-1.5">
            <SidebarGroupLabel className="h-8 px-3 text-[0.66rem] font-bold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActiveRoute(pathname, item.href)}
                      tooltip={item.label}
                      render={
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          aria-current={isActiveRoute(pathname, item.href) ? 'page' : undefined}
                        />
                      }
                      className="group/nav relative h-11 gap-2.5 rounded-xl px-2 text-[0.9rem] font-medium text-white/75 transition-colors hover:bg-white/8 hover:text-white data-active:bg-linear-to-r data-active:from-gold/25 data-active:via-gold/10 data-active:to-transparent data-active:font-semibold data-active:text-white data-active:shadow-[inset_0_0_0_1px_rgb(255_204_0/0.3)] motion-reduce:transition-none"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white/65 transition-colors group-data-active/nav:bg-gold group-data-active/nav:text-brand-dark group-data-active/nav:shadow-sm group-data-[collapsible=icon]:size-auto group-data-[collapsible=icon]:group-data-active/nav:bg-transparent group-data-[collapsible=icon]:group-data-active/nav:text-gold motion-reduce:transition-none">
                        <item.icon className="size-[1.125rem]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span
                        aria-hidden="true"
                        className="mr-1 size-1.5 shrink-0 rounded-full bg-gold opacity-0 group-data-active/nav:opacity-100 group-data-[collapsible=icon]:hidden"
                      />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-1">
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
