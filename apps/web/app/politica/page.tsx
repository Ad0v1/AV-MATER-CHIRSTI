import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AcceptPolicyForm } from '@/components/auth/accept-policy-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Política y términos' };

export default function PolicyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Política de privacidad y términos de uso</h1>
        <p className="mt-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Texto pendiente: la institución debe entregar la política de privacidad y los términos de
          uso definitivos (Ley 29733 y protección de menores, ERS §1.4). Este espacio mostrará ese
          texto.
        </p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
            <PolicyAction />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

// Lee la sesion (dato de la peticion), por eso va dentro de Suspense.
async function PolicyAction() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect('/cambiar-clave');
  if (!user.mustAcceptPolicy) {
    redirect(user.mustVerifyEmail ? '/verificar-correo' : HOME_BY_ROLE[user.role]);
  }
  // Después de la política sigue el correo, si falta; el layout de la app lo comprueba.
  return <AcceptPolicyForm role={user.role} nextPath={HOME_BY_ROLE[user.role]} />;
}
