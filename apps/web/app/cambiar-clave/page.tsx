import { Suspense } from 'react';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Cambiar contraseña' };

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Suspense fallback={<p className="text-sm text-ink-3">Cargando…</p>}>
          <ChangePasswordContent />
        </Suspense>
      </div>
    </main>
  );
}

// Lee la sesión (dato de la petición), por eso va dentro de Suspense.
async function ChangePasswordContent() {
  const user = await requireUser();
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Cambiar contraseña</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">
        {user.mustChangePassword
          ? 'Por seguridad, debes cambiar la contraseña que te entregó el colegio antes de continuar.'
          : 'Al cambiarla, se cerrarán tus otras sesiones abiertas.'}
      </p>
      <ChangePasswordForm homePath={HOME_BY_ROLE[user.role]} />
    </>
  );
}
