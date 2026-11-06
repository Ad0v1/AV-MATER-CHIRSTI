import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { EnableTwoFactorForm } from '@/components/auth/enable-two-factor-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Verificación en dos pasos' };

export default function EnableTwoFactorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Suspense fallback={<p className="text-sm text-ink-3">Cargando…</p>}>
          <EnableTwoFactorContent />
        </Suspense>
      </div>
    </main>
  );
}

// Lee la sesión (dato de la petición), por eso va dentro de Suspense.
async function EnableTwoFactorContent() {
  const user = await requireUser();
  // Antes van la contraseña, la política y el correo (RF-71); la API lo exige igual.
  if (user.mustChangePassword) redirect('/cambiar-clave');
  if (user.mustAcceptPolicy) redirect('/politica');
  if (user.mustVerifyEmail) redirect('/verificar-correo');
  if (!user.mustEnableTwoFactor) {
    redirect(user.mustCompleteContact ? '/mi-perfil' : HOME_BY_ROLE[user.role]);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Activa la verificación en dos pasos</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">
        Es obligatoria para el administrador: además de tu contraseña, te pediremos un código de tu
        teléfono cada vez que ingreses.
      </p>
      <EnableTwoFactorForm homePath={HOME_BY_ROLE[user.role]} />
    </>
  );
}
