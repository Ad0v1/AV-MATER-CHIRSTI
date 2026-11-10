'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleAlert, Copy, Loader2 } from 'lucide-react';
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
  const [secretCopied, setSecretCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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
      <div className="grid gap-5">
        <ol className="grid gap-4">
          <li className="flex items-center gap-4 text-sm leading-relaxed text-ink-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-bold text-brand">
              1
            </span>
            <span>
              Instala una aplicación autenticadora en tu teléfono (Google Authenticator, etc.).
            </span>
          </li>
          <li className="flex items-center gap-4 text-sm leading-relaxed text-ink-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-bold text-brand">
              2
            </span>
            <span>Registra en ella la clave que te mostraremos.</span>
          </li>
          <li className="flex items-center gap-4 text-sm leading-relaxed text-ink-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-bold text-brand">
              3
            </span>
            <span>Escribe aquí el código de 6 dígitos que te muestra la aplicación.</span>
          </li>
        </ol>
        {errorBox}
        <Button
          type="button"
          variant="gold"
          className="h-12 rounded-xl text-base font-semibold"
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

  const secret = setup.secret;

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setCopyMessage('Clave copiada.');
    } catch {
      setSecretCopied(false);
      setCopyMessage('No se pudo copiar. Selecciona la clave y cópiala manualmente.');
    }
  }

  return (
    <form onSubmit={confirm} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold text-brand">Clave para tu aplicación</p>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/80 px-3 py-2">
          <p className="min-w-0 flex-1 py-1 font-mono text-sm leading-relaxed break-all tabular-nums select-all">
            {groups(setup.secret)}
          </p>
          <button
            type="button"
            onClick={() => void copySecret()}
            aria-label={secretCopied ? 'Clave copiada' : 'Copiar clave de configuración'}
            title={secretCopied ? 'Clave copiada' : 'Copiar clave'}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {secretCopied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-xs text-ink-2">
          {copyMessage}
        </p>
        <p className="text-sm leading-relaxed text-ink-2">
          En tu aplicación elige «Ingresar una clave de configuración», escribe un nombre
          cualquiera, pega esta clave y deja el tipo «Basado en tiempo». Esta clave no se vuelve a
          mostrar.
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="totp-enable" className="text-sm font-semibold text-brand">
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
          className="h-12 rounded-xl bg-surface-2 text-center text-lg tracking-[0.4em] tabular-nums"
        />
      </div>

      {errorBox}

      <Button
        type="submit"
        variant="gold"
        disabled={pending || code.length !== 6}
        className="h-12 rounded-xl text-base font-semibold"
      >
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        Activar verificación en dos pasos
      </Button>
    </form>
  );
}
