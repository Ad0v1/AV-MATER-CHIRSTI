'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('No se pudo registrar la aceptación. Inténtalo de nuevo.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Checkbox checked={privacy} onChange={setPrivacy} disabled={pending}>
        He leído y acepto la <strong>política de privacidad</strong>.
      </Checkbox>
      <Checkbox checked={terms} onChange={setTerms} disabled={pending}>
        He leído y acepto los <strong>términos de uso</strong>.
      </Checkbox>
      {isGuardian && (
        <Checkbox checked={onBehalf} onChange={setOnBehalf} disabled={pending}>
          Acepto lo anterior <strong>en nombre de los alumnos vinculados a mí</strong>.
        </Checkbox>
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

      <Button type="submit" variant="gold" disabled={!ready || pending} className="h-11 text-base">
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pending ? 'Registrando…' : 'Continuar'}
      </Button>
    </form>
  );
}

function Checkbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-5 shrink-0 accent-brand"
      />
      <span>{children}</span>
    </label>
  );
}
