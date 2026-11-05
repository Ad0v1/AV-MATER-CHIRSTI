'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Role } from '@/lib/roles';

type ApiError = { error?: { code?: string; message?: string } };

const RESEND_SECONDS = 60;

// RF-80 y RF-81: el usuario registra su correo y lo confirma con un código de 6 dígitos que vale
// 5 minutos. Un alumno sin correo propio usa el de su apoderado.
export function VerifyEmailForm({ role, homePath }: { role: Role; homePath: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [guardian, setGuardian] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  // Cuenta regresiva del botón de reenvío (la API vuelve a limitar el reenvío).
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function call(path: string, body: object): Promise<Response | null> {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
      const data = (await res.json().catch(() => ({}))) as ApiError;
      setError(data.error?.message ?? 'No se pudo completar la operación. Inténtalo de nuevo.');
      return null;
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
      return null;
    } finally {
      setPending(false);
    }
  }

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const res = await call('email/start', { email, ...(role === 'STUDENT' ? { guardian } : {}) });
    if (res) {
      setStep('code');
      setCode('');
      setWait(RESEND_SECONDS);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await call('email/verify', { code });
    if (res) {
      router.replace(homePath);
      router.refresh();
    }
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="grid gap-5" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            Correo electrónico
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="h-11 bg-surface"
          />
        </div>

        {role === 'STUDENT' && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={guardian}
              onChange={(e) => setGuardian(e.target.checked)}
              disabled={pending}
              className="mt-0.5 size-5 shrink-0 accent-brand"
            />
            <span>No tengo correo propio: este es el correo de mi apoderado.</span>
          </label>
        )}

        <ErrorBox message={error} />
        <Button
          type="submit"
          variant="gold"
          disabled={pending || !email}
          className="h-11 text-base"
        >
          {pending && <Spinner />}
          {pending ? 'Enviando…' : 'Enviar código'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="grid gap-5" noValidate>
      <p role="status" className="text-sm text-ink-2">
        Enviamos un código de 6 dígitos a <strong className="break-all">{email}</strong>. Vale 5
        minutos.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="code" className="text-sm font-medium text-ink">
          Código de verificación
        </label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          disabled={pending}
          className="h-11 bg-surface text-center text-lg tracking-[0.4em] tabular-nums"
        />
      </div>

      <ErrorBox message={error} />
      <Button
        type="submit"
        variant="gold"
        disabled={pending || code.length !== 6}
        className="h-11 text-base"
      >
        {pending && <Spinner />}
        {pending ? 'Verificando…' : 'Verificar correo'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={pending || wait > 0}
          className="min-h-11 text-brand underline-offset-2 hover:underline disabled:text-ink-disabled disabled:no-underline"
        >
          {wait > 0 ? `Reenviar código (${wait} s)` : 'Reenviar código'}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setError(null);
          }}
          disabled={pending}
          className="min-h-11 text-brand underline-offset-2 hover:underline disabled:text-ink-disabled"
        >
          Cambiar correo
        </button>
      </div>
    </form>
  );
}

function Spinner() {
  return <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
