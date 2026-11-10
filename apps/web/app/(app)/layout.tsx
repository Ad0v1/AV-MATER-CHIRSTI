import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AppShellLoadingSkeleton } from '@/components/layout/page-loading-skeleton';
import { RouteTransition } from '@/components/layout/route-transition';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ONBOARDING_ROUTES } from '@/lib/onboarding';
import { requireUser } from '@/lib/session';

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
  if (user.mustCompleteContact) redirect('/mi-perfil');

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset className="bg-transparent">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-surface/70 px-4 backdrop-blur-sm">
          <SidebarTrigger />
        </header>
        <RouteTransition>{children}</RouteTransition>
      </SidebarInset>
    </SidebarProvider>
  );
}
