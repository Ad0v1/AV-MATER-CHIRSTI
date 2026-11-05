'use client';

// Credenciales recién emitidas (RF-70, RF-74, RF-84). Se muestran una sola vez: el servidor no las
// vuelve a dar. Viven solo en el estado de la acción (memoria de esta pantalla): no van en la URL.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { TOUCH } from '../../_shared/components/styles';
import type { IssuedAccount } from '../../_shared/lib/action-state';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const announce = useAnnounce();
  return (
    <Button
      type="button"
      variant="outline"
      className={TOUCH}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          announce(`${label} copiado.`);
        } catch {
          announce('No se pudo copiar. Selecciónalo y cópialo a mano.');
        }
      }}
    >
      {copied ? 'Copiado' : 'Copiar'}
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

export function CredentialsCard({
  message,
  issued,
  nextHref,
}: {
  message?: string;
  issued: IssuedAccount[];
  nextHref?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const announce = useAnnounce();
  // Al aparecer, anuncia el resultado y lleva el foco a la tarjeta (quien usa teclado o lector
  // empieza en las credenciales).
  useEffect(() => {
    if (message) announce(message);
    ref.current?.focus();
  }, [announce, message]);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="credenciales-titulo"
      className="flex flex-col gap-4 rounded-xl border-2 border-emerald-700 p-4 outline-none focus:ring-3 focus:ring-ring/60 dark:border-emerald-400"
    >
      <div className="flex flex-col gap-1">
        <h2 id="credenciales-titulo" className="text-lg font-semibold">
          Credenciales para entregar
        </h2>
        <p className="text-sm text-muted-foreground">
          {message ?? 'Entrégalas ahora.'} No se guardan ni se pueden volver a ver: si se pierden,
          restablece la contraseña desde la ficha del usuario. La persona debe cambiarla en su
          primer ingreso.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {issued.map((a) => (
          <li
            key={`${a.label}-${a.code}`}
            className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/15"
          >
            <h3 className="font-semibold break-words">{a.label}</h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Código de usuario</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-base font-semibold tracking-wider tabular-nums">
                    {a.code}
                  </code>
                  <CopyButton value={a.code} label="el código" />
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Contraseña inicial</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-base font-semibold tracking-wider">
                    {a.password}
                  </code>
                  <CopyButton value={a.password} label="la contraseña" />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" variant="outline" className={TOUCH} onClick={() => window.print()}>
          Imprimir
        </Button>
        {nextHref ? (
          <Link
            href={nextHref}
            className={cn(
              buttonVariants({ variant: 'default' }),
              TOUCH,
              'inline-flex items-center',
            )}
          >
            Ver la ficha
          </Link>
        ) : null}
      </div>
    </section>
  );
}
