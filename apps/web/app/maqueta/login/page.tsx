'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Login completo (guia 4.9). Solo visual: no valida ni llama a ninguna API.
 * Composicion de David (114011e): panel de foto a la izquierda con escudo, nombre y lema; a la
 * derecha, tarjeta con el formulario. Un solo h1 ("Iniciar sesion"). Mismo login para todo el
 * colegio: sin mencionar nivel.
 */
export default function LoginMaqueta() {
  const [verClave, setVerClave] = useState(false);

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // Maqueta: sin logica.
  }

  const escudo = (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white p-1 lg:size-16">
      <Image
        unoptimized
        src="/brand/escudo.webp"
        alt="Colegio Mater Christi"
        width={64}
        height={64}
        className="size-full object-contain"
      />
    </span>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <div
        role="note"
        className="flex items-center gap-2 bg-gold px-4 py-2 text-sm font-semibold text-brand-dark"
      >
        <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
        Maqueta: datos de ejemplo
        <Link
          href="/maqueta"
          className="ml-auto inline-flex min-h-6 items-center underline underline-offset-4"
        >
          Índice
        </Link>
      </div>

      <main className="grid flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:grid-rows-1">
        {/* Panel de foto: banda de 176 px en movil, panel completo desde 1024 px. */}
        <aside className="relative isolate flex h-44 flex-col justify-center overflow-hidden border-b-4 border-gold bg-brand px-5 text-white lg:h-auto lg:justify-between lg:border-b-0 lg:p-12">
          <Image
            unoptimized
            src="/maqueta/img/login.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 56vw, 100vw"
            className="-z-20 object-cover object-[center_46%]"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-(--scrim-70) lg:hidden" />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden bg-(image:--scrim-login) lg:block"
          />

          <div className="flex items-center gap-4">
            {escudo}
            <div>
              <p className="font-heading text-lg leading-[1.625rem] font-semibold lg:text-2xl lg:leading-8">
                Colegio Mater Christi
              </p>
              <p className="text-base leading-6 font-semibold">Aula Virtual</p>
            </div>
          </div>

          <div className="hidden max-w-lg lg:block">
            <span aria-hidden="true" className="mb-6 block h-1 w-14 rounded-full bg-gold" />
            <p className="font-heading text-4xl leading-11 font-semibold text-balance">
              Tu aula, tus cursos y tus notas en un solo lugar.
            </p>
            <p className="mt-4 text-base leading-6">
              Plataforma del colegio para estudiantes, docentes y familias de inicial, primaria y
              secundaria.
            </p>
          </div>

          <div className="hidden text-sm leading-5 lg:block">
            <p className="font-semibold">Colegio Mater Christi · Cañete</p>
            <p>© 2026 · Plataforma de uso exclusivo de la comunidad educativa</p>
          </div>
        </aside>

        <section className="flex flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-(--shadow-raised) ring-1 ring-line sm:p-8">
            <h1 className="font-heading text-2xl leading-8 font-semibold text-brand">
              Iniciar sesión
            </h1>
            <p className="mt-1 mb-6 text-base leading-6 text-ink-2">
              Te damos la bienvenida. Ingresa con tu código de usuario y tu contraseña.
            </p>

            <form onSubmit={alEnviar} className="grid gap-5" noValidate>
              <div className="grid gap-1.5">
                <label htmlFor="m-code" className="text-base font-semibold text-ink">
                  Código de usuario
                </label>
                <Input
                  id="m-code"
                  inputMode="numeric"
                  autoComplete="username"
                  maxLength={10}
                  autoFocus
                  aria-describedby="m-code-ayuda"
                  placeholder="Ingresa tu código de usuario"
                  className="h-12 rounded-xl border-line-field bg-surface px-4 tracking-widest tabular-nums placeholder:tracking-normal"
                />
                <p id="m-code-ayuda" className="text-sm leading-5 text-ink-2">
                  Son 10 dígitos y te lo entregó el colegio.
                </p>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="m-clave" className="text-base font-semibold text-ink">
                  Contraseña
                </label>
                <div className="relative">
                  <Input
                    id="m-clave"
                    type={verClave ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    className="h-12 rounded-xl border-line-field bg-surface pr-12 pl-4"
                  />
                  <button
                    type="button"
                    aria-pressed={verClave}
                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setVerClave((v) => !v)}
                    className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center rounded-lg text-ink-2 hover:text-ink"
                  >
                    {verClave ? (
                      <EyeOff className="size-5" aria-hidden="true" />
                    ) : (
                      <Eye className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Link
                href="/maqueta/login"
                className="inline-flex min-h-11 items-center justify-self-end rounded-sm text-base font-medium text-brand underline-offset-4 hover:underline focus-visible:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>

              <Button
                type="submit"
                variant="gold"
                className="h-12 w-full rounded-xl text-base font-semibold"
              >
                Ingresar
              </Button>
            </form>

            <p className="mt-6 border-t border-line pt-4 text-sm leading-5 text-ink-2">
              Si no puedes ingresar, comunícate con el administrador del colegio.
            </p>
          </div>

          <div className="text-center text-sm leading-5 text-ink-2 lg:hidden">
            <p className="font-semibold">Colegio Mater Christi · Cañete</p>
            <p>© 2026 · Plataforma de uso exclusivo de la comunidad educativa</p>
          </div>
        </section>
      </main>
    </div>
  );
}
