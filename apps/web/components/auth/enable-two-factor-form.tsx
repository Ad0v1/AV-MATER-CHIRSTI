'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ApiError = { error?: { code?: string; message?: string } };
type Setup = { secret: string; otpauthUrl: string };

/** La clave en grupos de 4 para copiarla a mano sin equivocarse. */
const groups = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

// RF-85: el administrador activa la verificación en dos pasos en su primer ingreso. 1) pide una
// clave, 2) la registra en su aplicación autenticadora y confirma con un código de 6 dígitos,
// 3) recibe los códigos de recuperación, que se muestran una sola vez.
export function EnableTwoFactorForm({ homePath }: { homePath: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function call(path: string, body?: object): Promise<Response | null> {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (res.ok) return res;
      const data = (await res.json().catch(() => ({}))) as ApiError;
      setError(
        res.status === 429
          ? 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.'
          : (data.error?.message ?? 'No se pudo completar la operación. Inténtalo de nuevo.'),
      );
      return null;
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
      return null;
    } finally {
      setPending(false);
    }
  }

  async function start() {
    const res = await call('2fa/setup');
    if (res) setSetup((await res.json()) as Setup);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await call('2fa/enable', { code });
    if (res) {
      const data = (await res.json()) as { recoveryCodes?: string[] };
      setCode('');
      setCodes(data.recoveryCodes ?? []);
    }
  }

  if (codes) {
    return (
      <RecoveryCodesView
        codes={codes}
        actionLabel="Continuar"
        onDone={() => {
          router.replace(homePath);
          router.refresh();
        }}
      />
    );
  }

  const errorBox = error && (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </p>
  );

  if (!setup) {
    return (
      <div className="grid gap-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Instala una aplicación autenticadora en tu teléfono (Google Authenticator, etc.).</li>
          <li>Registra en ella la clave que te mostraremos.</li>
          <li>Escribe aquí el código de 6 dígitos que te muestra la aplicación.</li>
        </ol>
        {errorBox}
        <Button
          type="button"
          variant="gold"
          className="h-11 text-base"
          disabled={pending}
          onClick={() => void start()}
        >
          {pending && (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          Empezar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <p className="text-sm font-medium text-ink">Clave para tu aplicación</p>
        <p
          aria-label="Clave de configuración"
          className="rounded-lg border border-line bg-canvas px-3 py-2.5 font-mono text-sm break-all tabular-nums select-all"
        >
          {groups(setup.secret)}
        </p>
        <p className="text-xs text-ink-3">
          En tu aplicación elige «Ingresar una clave de configuración», escribe un nombre
          cualquiera, pega esta clave y deja el tipo «Basado en tiempo». Esta clave no se vuelve a
          mostrar.
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="totp-enable" className="text-sm font-medium text-ink">
          Código de verificación
        </label>
        <Input
          id="totp-enable"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          disabled={pending}
          className="h-11 bg-surface text-center text-lg tracking-[0.4em] tabular-nums"
        />
      </div>

      {errorBox}

      <Button
        type="submit"
        variant="gold"
        disabled={pending || code.length !== 6}
        className="h-11 text-base"
      >
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        Activar verificación en dos pasos
      </Button>
    </form>
  );
}
