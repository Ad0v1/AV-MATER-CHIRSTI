import Image from 'next/image';
import { GraduationCap } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Iniciar sesión · Aula Virtual' };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <aside className="flex flex-col justify-between gap-12 border-b-4 border-gold bg-brand px-6 py-6 text-ink-inverse lg:border-r-0 lg:border-b-0 lg:p-12">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gold text-brand-dark">
            <GraduationCap className="size-6" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">Aula Virtual</span>
        </div>

        <div className="hidden max-w-md lg:block">
          <span className="mb-6 block h-1 w-14 rounded-full bg-gold" aria-hidden="true" />
          <p className="text-4xl leading-tight font-semibold text-balance">
            Tu aula, tus cursos y tus notas en un solo lugar.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink-inverse/80">
            Plataforma institucional de nivel secundaria para estudiantes, docentes y familias.
          </p>
        </div>

        <p className="hidden text-sm text-ink-inverse/70 lg:block">Nivel Secundaria</p>
      </aside>

      <section className="flex items-center justify-center bg-canvas px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <Image
            src="/brand/escudo.webp"
            alt="Escudo del colegio Mater Christi, Cañete"
            width={112}
            height={112}
            priority
            unoptimized
            className="mx-auto mb-5 h-28 w-auto"
          />
          <h1 className="text-center text-2xl font-semibold text-ink">Iniciar sesión</h1>
          <p className="mt-1 mb-6 text-center text-sm text-ink-2">
            Ingresa con tu cuenta institucional.
          </p>
          <LoginForm />
          <p className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
            Si no puedes ingresar, comunícate con el administrador del colegio.
          </p>
        </div>
      </section>
    </main>
  );
}
