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
import { ROLE_LABELS, type Role } from '@/lib/roles';

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          aria-label="Aula Virtual Mater Christi"
          className="group/brand flex min-h-14 items-center gap-3 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring group-data-[collapsible=icon]:justify-center"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-white/20 group-data-[collapsible=icon]:size-8">
            <Image
              src="/brand/escudo.webp"
              alt=""
              width={38}
              height={44}
              priority
              className="h-9 w-8 object-contain group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-6"
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
                      isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                      tooltip={item.label}
                      render={<Link href={item.href} aria-label={item.label} />}
                      className="relative h-10 rounded-xl px-3 text-[0.9rem] font-medium text-white/80 transition-colors before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gold before:opacity-0 before:content-[''] data-active:bg-white/12 data-active:font-semibold data-active:text-white data-active:before:opacity-100 [&>svg]:text-white/65 data-active:[&>svg]:text-gold"
                    >
                      <item.icon className="size-[1.125rem]" />
                      <span>{item.label}</span>
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
