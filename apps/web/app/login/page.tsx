import Image from 'next/image';
import { LoginForm } from '@/components/auth/login-form';
import loginBackground from '../../assets/fondo_login_av.webp';

export const metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <main className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-canvas lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-1">
      <aside className="relative isolate hidden min-h-0 flex-col overflow-hidden bg-brand px-5 py-3 text-ink-inverse lg:flex lg:px-12 lg:py-10">
        <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <Image
            src={loginBackground}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 54vw, 100vw"
            className="object-cover object-[center_46%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-brand-dark/80 via-brand-dark/15 to-brand-dark/90" />
        </div>

        <div className="flex items-center gap-3.5">
          <Image
            src="/brand/escudo.webp"
            alt=""
            width={60}
            height={72}
            unoptimized
            className="h-12 w-10 object-contain sm:h-[68px] sm:w-14"
          />
          <div>
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">Mater Christi</p>
            <p className="mt-0.5 text-sm text-ink-inverse/80 sm:text-base">Aula virtual</p>
          </div>
        </div>

        <div className="mt-auto max-w-xl pt-4 lg:pb-5 lg:pt-16">
          <span className="mb-3 block h-1 w-12 rounded-full bg-gold lg:mb-5" />
          <p className="max-w-lg text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Un espacio para seguir aprendiendo.
          </p>
          <p className="mt-3 hidden max-w-md text-base leading-relaxed text-ink-inverse/85 sm:block sm:text-lg lg:mt-4">
            Tu comunidad educativa, siempre cerca.
          </p>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-canvas px-5 py-6 sm:px-10 sm:py-8 lg:px-12 lg:py-7">
        <div className="my-auto w-full max-w-md self-center">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Image
              src="/brand/escudo.webp"
              alt=""
              width={48}
              height={56}
              unoptimized
              className="h-12 w-10 object-contain"
            />
            <div>
              <p className="text-lg font-semibold tracking-tight text-brand">Mater Christi</p>
              <p className="text-sm text-ink-2">Aula virtual</p>
            </div>
          </div>
          <div className="mb-6 lg:mb-8">
            <p className="mb-3 hidden text-sm font-semibold tracking-[0.12em] text-brand uppercase lg:block">
              Aula virtual
            </p>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight text-brand sm:text-5xl">
              Bienvenido
            </h1>
            <p className="mt-3 text-base leading-relaxed text-ink-2 sm:text-lg">
              Ingresa a tu cuenta para continuar.
            </p>
          </div>

          <LoginForm />

          <p className="mt-9 text-center text-sm text-ink-2">
            ¿Necesitas ayuda? Comunícate con la administración del colegio.
          </p>
        </div>
      </section>
    </main>
  );
}
