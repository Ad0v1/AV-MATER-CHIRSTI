import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RecoverForm } from '@/components/auth/recover-form';

export const metadata = { title: 'Recuperar contraseña' };

export default function RecoverPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8 sm:py-10">
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
            Recupera tu contraseña
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-2">
            Te enviaremos un código al correo que verificaste en tu primer ingreso.
          </p>
        </header>

        <div className="p-6 sm:p-9">
          <RecoverForm />
          <div className="mt-8 grid gap-3 border-t border-line pt-5 text-sm text-ink-2">
            <p>¿No tienes correo verificado? Comunícate con el administrador del colegio.</p>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Volver a iniciar sesión
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}
