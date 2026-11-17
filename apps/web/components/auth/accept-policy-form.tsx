'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchNextPath } from '@/lib/onboarding';
import type { Role } from '@/lib/roles';

type ApiError = { error?: { message?: string; details?: unknown[] } };

// RF-07: dos casillas separadas y obligatorias. El apoderado marca además que acepta en nombre
// de los alumnos vinculados a él. La API vuelve a exigirlas.
export function AcceptPolicyForm({ role, nextPath }: { role: Role; nextPath: string }) {
  const router = useRouter();
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [onBehalf, setOnBehalf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isGuardian = role === 'GUARDIAN';
  const ready = privacy && terms && (!isGuardian || onBehalf);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/policy/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privacy,
          terms,
          ...(isGuardian ? { onBehalfOfWards: onBehalf } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        throw new Error(body.error?.message ?? 'rechazado');
      }
      // Directo al siguiente paso pendiente (correo, 2FA…) sin pasar por el inicio.
      router.replace(await fetchNextPath(nextPath));
      router.refresh();
    } catch {
      setError('No se pudo registrar la aceptación. Inténtalo de nuevo.');
      setPending(false);
    }
  }

  const items = [
    { id: 'privacy', checked: privacy, set: setPrivacy, name: 'la política de privacidad' },
    { id: 'terms', checked: terms, set: setTerms, name: 'los términos de uso' },
    ...(isGuardian
      ? [
          {
            id: 'onbehalf',
            checked: onBehalf,
            set: setOnBehalf,
            name: 'lo anterior en nombre de tus alumnos',
          },
        ]
      : []),
  ];
  const missing = items.filter((item) => !item.checked);

  function touch(id: string) {
    setTouched((prev) => ({ ...prev, [id]: true }));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <Checkbox
        id="accept-privacy"
        checked={privacy}
        onChange={(v) => {
          touch('privacy');
          setPrivacy(v);
        }}
        disabled={pending}
        error={(touched.privacy || attempted) && !privacy}
        errorText="Debes aceptar la política de privacidad."
      >
        He leído y acepto la <strong>política de privacidad</strong>.
      </Checkbox>
      <Checkbox
        id="accept-terms"
        checked={terms}
        onChange={(v) => {
          touch('terms');
          setTerms(v);
        }}
        disabled={pending}
        error={(touched.terms || attempted) && !terms}
        errorText="Debes aceptar los términos de uso."
      >
        He leído y acepto los <strong>términos de uso</strong>.
      </Checkbox>
      {isGuardian && (
        <Checkbox
          id="accept-onbehalf"
          checked={onBehalf}
          onChange={(v) => {
            touch('onbehalf');
            setOnBehalf(v);
          }}
          disabled={pending}
          error={(touched.onbehalf || attempted) && !onBehalf}
          errorText="Debes aceptar en nombre de los alumnos vinculados a ti."
        >
          Acepto lo anterior <strong>en nombre de los alumnos vinculados a mí</strong>.
        </Checkbox>
      )}

      {attempted && missing.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>No puedes continuar sin aceptar: {missing.map((m) => m.name).join(' y ')}.</span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {/* aria-disabled (y no disabled) para poder mostrar el aviso al intentar continuar y el cursor de "no permitido". */}
      <Button
        type="submit"
        variant="gold"
        disabled={pending}
        aria-disabled={!ready || pending}
        onClick={(event) => {
          if (!ready) {
            event.preventDefault();
            setAttempted(true);
          }
        }}
        className={`mt-2 h-11 text-base ${
          !ready && !pending ? 'cursor-not-allowed opacity-50 hover:bg-gold' : ''
        }`}
      >
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pending ? 'Registrando…' : 'Continuar'}
      </Button>
    </form>
  );
}

// Solo la casilla activa la aceptación: el texto no es clicable.
function Checkbox({
  id,
  checked,
  onChange,
  disabled,
  error,
  errorText,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  error?: boolean;
  errorText: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`py-1 text-sm text-ink ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error || undefined}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:cursor-not-allowed"
        />
        <span id={`${id}-label`} className="leading-snug">
          {children}
        </span>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="mt-2 ml-8 flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {errorText}
        </p>
      )}
    </div>
  );
}
