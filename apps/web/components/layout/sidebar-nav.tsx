'use client';

// Menú del sidebar por rol, con la página activa resaltada (diseño de David, PR #21). Va aparte
// porque usePathname solo funciona en cliente, y el sidebar sigue siendo de servidor para cargar
// el logo del colegio y "Mis cursos".
import Link, { useLinkStatus } from 'next/link';
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
import type { Role } from '@/lib/roles';

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();

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
                isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                tooltip={item.label}
                render={<Link href={item.href} aria-label={item.label} />}
                className="relative h-10 rounded-xl px-3 text-[0.9rem] font-medium text-white/80 transition-colors before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-gold before:opacity-0 before:content-[''] data-active:bg-white/12 data-active:font-semibold data-active:text-white data-active:before:opacity-100 [&>svg]:text-white/65 data-active:[&>svg]:text-gold"
              >
                <item.icon className="size-[1.125rem]" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <NavDot />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

// Apenas se hace clic en un enlace, el punto late mientras carga la página: señal inmediata.
function NavDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`ml-auto size-1.5 shrink-0 rounded-full bg-gold group-data-[collapsible=icon]:hidden ${
        pending ? 'animate-pulse opacity-100 motion-reduce:animate-none' : 'opacity-0'
      }`}
    />
  );
}
