import { Suspense } from 'react';
import Image from 'next/image';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Cambiar contraseña' };

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 sm:py-10">
      <Suspense
        fallback={
          <p role="status" className="text-sm text-ink-2">
            Cargando…
          </p>
        }
      >
        <ChangePasswordContent />
      </Suspense>
    </main>
  );
}

// Lee la sesión (dato de la petición), por eso va dentro de Suspense.
async function ChangePasswordContent() {
  const user = await requireUser();
  return (
    <article className="w-full max-w-xl overflow-hidden rounded-3xl border border-surface/80 bg-surface/92 shadow-xl shadow-brand/10 backdrop-blur-md">
      <header className="border-b border-line/70 bg-gradient-to-br from-brand-soft/80 via-surface/80 to-gold-soft/70 px-6 py-6 sm:px-9 sm:py-8">
        <div className="mb-5 flex items-center gap-3">
          <Image
            src="/brand/escudo.webp"
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12 shrink-0 object-contain"
          />
          <div>
            <p className="font-heading text-base font-semibold text-brand">Mater Christi</p>
            <p className="text-sm text-ink-2">Aula virtual</p>
          </div>
        </div>
        <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-brand uppercase">
          Seguridad de tu cuenta
        </p>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-brand sm:text-3xl">
          Cambia tu contraseña
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-2">
          {user.mustChangePassword
            ? 'Por seguridad, debes cambiar la contraseña que te entregó el colegio antes de continuar.'
            : 'Al cambiarla, se cerrarán tus otras sesiones abiertas.'}
        </p>
      </header>

      <div className="p-6 sm:p-9">
        <ChangePasswordForm homePath={HOME_BY_ROLE[user.role]} />
      </div>
    </article>
  );
}
