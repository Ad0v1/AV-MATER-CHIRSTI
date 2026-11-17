'use client';

// Menú del sidebar por rol, con la página activa resaltada (diseño de David, PR #21). Va aparte
// porque usePathname solo funciona en cliente, y el sidebar sigue siendo de servidor para cargar
// el logo del colegio y "Mis cursos".
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { NAV_BY_ROLE } from '@/lib/nav';
import { NavPendingReporter, usePendingHref } from './pending-nav';
import type { Role } from '@/lib/roles';

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  // Con una navegación en curso se resalta ya el destino, sin esperar a que cargue la página.
  const pendingHref = usePendingHref();
  const current = pendingHref ?? pathname;

  return NAV_BY_ROLE[role].map((group) => (
    <SidebarGroup key={group.label} className="px-1.5 py-1.5">
      <SidebarGroupLabel className="h-8 px-3 text-[0.66rem] font-bold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
        {group.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1.5">
          {group.items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={current === item.href || current.startsWith(`${item.href}/`)}
                tooltip={item.label}
                render={<Link href={item.href} aria-label={item.label} />}
                className="h-10 rounded-xl border-l-[3px] border-transparent pr-3 pl-[9px] text-[0.9rem] font-medium text-white/80 transition-colors data-active:border-gold data-active:bg-white/10 data-active:font-semibold data-active:text-white [&>svg]:text-white/65 data-active:[&>svg]:text-white"
              >
                <item.icon className="size-[1.125rem]" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <NavPendingReporter href={item.href} />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
