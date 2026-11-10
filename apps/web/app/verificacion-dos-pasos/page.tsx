import { Suspense } from 'react';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { EnableTwoFactorForm } from '@/components/auth/enable-two-factor-form';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import pageBackground from '../../assets/fondo_paginas.webp';

export const metadata = { title: 'Verificación en dos pasos' };

export default function EnableTwoFactorPage() {
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <div className="absolute inset-0 -z-10 hidden overflow-hidden xl:block" aria-hidden="true">
        <Image src={pageBackground} alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-canvas/20" />
      </div>

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
            Activa la verificación en dos pasos
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-2">
            Es obligatoria para el administrador. Además de tu contraseña, te pediremos un código de
            tu teléfono cada vez que ingreses.
          </p>
        </header>

        <div className="p-6 sm:p-9">
          <Suspense
            fallback={
              <p role="status" className="text-sm text-ink-2">
                Cargando la configuración…
              </p>
            }
          >
            <EnableTwoFactorContent />
          </Suspense>
        </div>
      </article>
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

  return <EnableTwoFactorForm homePath={HOME_BY_ROLE[user.role]} />;
}
