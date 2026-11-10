import { Suspense } from 'react';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { AcceptPolicyForm } from '@/components/auth/accept-policy-form';
import { LegalDocument } from '@/components/legal/legal-document';
import { nextStepPath, ONBOARDING_ROUTES } from '@/lib/onboarding';
import { HOME_BY_ROLE } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Política de privacidad y términos' };

export default function PolicyPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 sm:py-10">
      <article className="w-full max-w-2xl overflow-hidden rounded-3xl border border-surface/80 bg-surface/92 shadow-xl shadow-brand/10 backdrop-blur-md">
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
            Privacidad y protección de datos
          </p>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-brand sm:text-3xl">
            Política de privacidad y términos de uso
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-2">
            Antes de continuar, lee y acepta cómo cuidamos tus datos y las reglas de uso del aula
            virtual.
          </p>
        </header>

        <div className="grid gap-6 p-6 sm:p-9">
          <section aria-labelledby="titulo-documento">
            <h2
              id="titulo-documento"
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"
            >
              <FileText className="size-4 text-brand" aria-hidden="true" />
              Documento
            </h2>
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="titulo-documento"
              className="max-h-[26rem] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2/70 p-4 text-sm leading-relaxed sm:p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
            >
              <LegalDocument />
            </div>
          </section>

          <Suspense
            fallback={
              <p role="status" className="text-sm text-ink-2">
                Cargando…
              </p>
            }
          >
            <PolicyAction />
          </Suspense>
        </div>
      </article>
    </main>
  );
}

// Lee la sesion (dato de la peticion), por eso va dentro de Suspense.
async function PolicyAction() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect(ONBOARDING_ROUTES.cambiarClave);
  if (!user.mustAcceptPolicy) redirect(nextStepPath(user));
  return <AcceptPolicyForm role={user.role} nextPath={HOME_BY_ROLE[user.role]} />;
}
