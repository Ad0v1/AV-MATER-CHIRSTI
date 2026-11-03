import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { requireUser } from '@/lib/session';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Cargando…</p>}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

// La sesion es un dato de la peticion: se lee aqui, dentro de Suspense, y se valida contra la API.
async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustAcceptPolicy) redirect('/politica');

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
