import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppShellLoadingSkeleton } from '@/components/layout/page-loading-skeleton';
import { DevRouteWarmup } from '@/components/layout/dev-route-warmup';
import { PendingContent, PendingNavProvider } from '@/components/layout/pending-nav';
import { RouteTransition } from '@/components/layout/route-transition';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { NAV_BY_ROLE } from '@/lib/nav';
import { ONBOARDING_ROUTES } from '@/lib/onboarding';
import { requireUser } from '@/lib/session';
import { NotificationBell } from './_notifications/notification-bell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShellLoadingSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

// La sesion es un dato de la peticion: se lee aqui, dentro de Suspense, y se valida contra la API.
async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Primero la contraseña inicial, después la política: la API rechaza todo lo demás hasta cambiarla.
  if (user.mustChangePassword) redirect('/cambiar-clave');
  if (user.mustAcceptPolicy) redirect(ONBOARDING_ROUTES.politica);
  if (user.mustVerifyEmail) redirect('/verificar-correo');
  if (user.mustEnableTwoFactor) redirect('/verificacion-dos-pasos');
  // /mi-perfil vive dentro del aula (sin parpadeo al entrar): no se redirige a si misma.
  if (user.mustCompleteContact && (await headers()).get('x-aula-pathname') !== '/mi-perfil') {
    redirect('/mi-perfil');
  }

  return (
    <SidebarProvider data-app-shell="">
      <PendingNavProvider>
        <DevRouteWarmup hrefs={NAV_BY_ROLE[user.role].flatMap((g) => g.items.map((i) => i.href))} />
        <AppSidebar role={user.role} />
        {/* Transparente: deja ver el fondo global de globals.css (body::before). */}
        <SidebarInset className="bg-transparent">
          {/* Topbar fijo y sólido: el fondo de imagen solo se ve debajo de él. */}
          <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-surface px-4">
            <SidebarTrigger className="size-11 md:size-8" />
            {/* RF-53 (Dev 5): campana de avisos, cambio mínimo autorizado el 06/11/2026. */}
            <div className="ml-auto">
              <NotificationBell role={user.role} />
            </div>
          </header>
          <RouteTransition>
            <PendingContent>{children}</PendingContent>
          </RouteTransition>
        </SidebarInset>
      </PendingNavProvider>
    </SidebarProvider>
  );
}
