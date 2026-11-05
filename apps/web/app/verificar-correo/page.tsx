import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Verificar correo' };

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Suspense fallback={<p className="text-sm text-ink-3">Cargando…</p>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}

// Lee la sesión (dato de la petición), por eso va dentro de Suspense.
async function VerifyEmailContent() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect('/cambiar-clave');
  if (user.mustAcceptPolicy) redirect('/politica');
  if (!user.mustVerifyEmail) redirect(HOME_BY_ROLE[user.role]);

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Verifica tu correo</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">
        Lo usaremos para avisarte y para que puedas recuperar tu contraseña. Es el último paso antes
        de entrar.
      </p>
      <VerifyEmailForm role={user.role} homePath={HOME_BY_ROLE[user.role]} />
    </>
  );
}
