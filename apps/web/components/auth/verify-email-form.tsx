'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, Loader2, Mail, MailCheck, Timer, TimerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchNextPath } from '@/lib/onboarding';
import type { Role } from '@/lib/roles';

type ApiError = { error?: { code?: string; message?: string } };

const RESEND_SECONDS = 60;
// Igual que CODE_TTL_SECONDS de la API: el código vale 5 minutos desde que se envía.
const CODE_TTL_SECONDS = 5 * 60;
const CODE_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// RF-80 y RF-81: el usuario registra su correo y lo confirma con un código de 6 dígitos que vale
// 5 minutos. Un alumno sin correo propio usa el de su apoderado.
export function VerifyEmailForm({ role, homePath }: { role: Role; homePath: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const emailInvalid = emailTouched && !emailValid;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = step === 'code' && expiresAt > 0 && remaining === 0;

  // Reloj del código: se calcula con la hora real (no restando 1 por tick) para no desfasarse.
  useEffect(() => {
    if (step !== 'code' || expiresAt === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, expiresAt]);

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
    setEmailTouched(true);
    if (!emailValid) return;
    const res = await call('email/start', {
      email: email.trim(),
      ...(role === 'STUDENT' ? { guardian } : {}),
    });
    if (res) {
      setStep('code');
      setCode('');
      setWait(RESEND_SECONDS);
      const start = Date.now();
      setNow(start);
      setExpiresAt(start + CODE_TTL_SECONDS * 1000);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (expired) {
      setError('El código venció. Pide uno nuevo con «Reenviar código».');
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setError('Escribe los 6 dígitos del código que te enviamos.');
      return;
    }
    const res = await call('email/verify', { code });
    if (res) {
      router.replace(await fetchNextPath(homePath));
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6">
      <Stepper step={step} />

      {step === 'email' ? (
        <form onSubmit={sendCode} className="grid gap-5" noValidate>
          <div className="grid gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@correo.com"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => email && setEmailTouched(true)}
                disabled={pending}
                aria-invalid={emailInvalid || undefined}
                aria-describedby="email-help"
                className="h-12 bg-surface pl-10"
              />
            </div>
            <p
              id="email-help"
              role={emailInvalid ? 'alert' : undefined}
              className={`flex items-center gap-1.5 text-xs ${
                emailInvalid ? 'font-medium text-danger' : 'text-ink-3'
              }`}
            >
              {emailInvalid ? (
                <>
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  Escribe un correo válido, por ejemplo nombre@correo.com.
                </>
              ) : (
                'Te enviaremos un código de 6 dígitos que vale 5 minutos.'
              )}
            </p>
          </div>

          {role === 'STUDENT' && (
            <div className="flex items-start gap-3 text-sm text-ink">
              <input
                id="guardian-email"
                type="checkbox"
                checked={guardian}
                onChange={(e) => setGuardian(e.target.checked)}
                disabled={pending}
                aria-labelledby="guardian-email-label"
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
              />
              <span id="guardian-email-label" className="leading-snug">
                No tengo correo propio: este es el correo de mi apoderado.
              </span>
            </div>
          )}

          <ErrorBox message={error} />
          <Button
            type="submit"
            variant="gold"
            disabled={pending}
            aria-disabled={!emailValid || pending}
            className={`h-12 text-base ${
              !emailValid && !pending ? 'cursor-not-allowed opacity-50 hover:bg-gold' : ''
            }`}
          >
            {pending && <Spinner />}
            {pending ? 'Enviando…' : 'Enviar código'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-5" noValidate>
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/70 p-4"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
              <MailCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">Revisa tu correo</p>
              <p className="mt-0.5 text-ink-2">
                Enviamos un código de 6 dígitos a <strong className="break-all">{email}</strong>.
                Vale 5 minutos.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="code" className="text-sm font-medium text-ink">
              Código de verificación
            </label>
            <CodeInput id="code" value={code} onChange={setCode} disabled={pending || expired} />
            <CodeTimer remaining={remaining} total={CODE_TTL_SECONDS} />
          </div>

          <ErrorBox message={error} />
          <Button
            type="submit"
            variant="gold"
            disabled={pending}
            aria-disabled={code.length !== CODE_LENGTH || expired || pending}
            className={`h-12 text-base ${
              (code.length !== CODE_LENGTH || expired) && !pending
                ? 'cursor-not-allowed opacity-50 hover:bg-gold'
                : ''
            }`}
          >
            {pending && <Spinner />}
            {pending ? 'Verificando…' : 'Verificar correo'}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={pending || wait > 0}
              className="min-h-11 rounded-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:cursor-not-allowed disabled:text-ink-disabled disabled:no-underline"
            >
              {wait > 0 ? `Reenviar código en ${wait} s` : 'Reenviar código'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError(null);
              }}
              disabled={pending}
              className="min-h-11 rounded-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:text-ink-disabled"
            >
              Cambiar correo
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Cuenta regresiva de la vigencia del código: barra que se vacía y tiempo en mm:ss. Cambia de color
// al acercarse el final y, al vencer, avisa y explica qué hacer.
function CodeTimer({ remaining, total }: { remaining: number; total: number }) {
  const expired = remaining === 0;
  const low = remaining <= 60;
  const urgent = remaining <= 30;
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, '0');

  if (expired) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
      >
        <TimerOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>El código venció. Pide uno nuevo con «Reenviar código».</span>
      </p>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-2">
          <Timer className="size-3.5" aria-hidden="true" />
          El código vence en
        </span>
        <span
          className={`font-semibold tabular-nums ${urgent ? 'text-danger' : low ? 'text-warning' : 'text-ink'}`}
        >
          {minutes}:{seconds}
          <span className="sr-only"> minutos</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Tiempo restante del código"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={remaining}
        aria-valuetext={`${minutes} minutos y ${seconds} segundos`}
        className="h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-1000 ease-linear motion-reduce:transition-none ${
            urgent ? 'bg-danger' : low ? 'bg-orange-500' : 'bg-brand'
          }`}
          style={{ width: `${(remaining / total) * 100}%` }}
        />
      </div>
      {low && !urgent && (
        <p role="status" className="sr-only">
          Queda menos de un minuto para que venza el código.
        </p>
      )}
    </div>
  );
}

// Indicador de los dos pasos: correo y código.
function Stepper({ step }: { step: 'email' | 'code' }) {
  const steps = [
    { id: 'email', label: 'Tu correo' },
    { id: 'code', label: 'Código' },
  ] as const;
  const current = step === 'email' ? 0 : 1;

  return (
    <ol className="flex items-center gap-3" aria-label="Progreso de la verificación">
      {steps.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={item.id}
            aria-current={active ? 'step' : undefined}
            className="flex flex-1 items-center gap-2.5 last:flex-none"
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors motion-reduce:transition-none ${
                done
                  ? 'bg-success text-ink-inverse'
                  : active
                    ? 'bg-brand text-ink-inverse'
                    : 'bg-surface-2 text-ink-3'
              }`}
            >
              {done ? <CheckCircle2 className="size-4" aria-hidden="true" /> : index + 1}
            </span>
            <span className={`text-sm font-medium ${active || done ? 'text-ink' : 'text-ink-3'}`}>
              {item.label}
              <span className="sr-only">{done ? ' (completado)' : active ? ' (actual)' : ''}</span>
            </span>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-0.5 flex-1 rounded-full ${done ? 'bg-success' : 'bg-line'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Seis casillas visuales sobre un único input real: acepta pegar, autocompletar y teclado numérico.
function CodeInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-2 sm:gap-3" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const isActive = focused && index === activeIndex;
          return (
            <div
              key={index}
              className={`grid h-14 place-items-center rounded-xl border bg-surface text-2xl font-semibold text-ink tabular-nums transition-colors motion-reduce:transition-none sm:h-16 ${
                isActive
                  ? 'border-line-active ring-3 ring-ring/40'
                  : value[index]
                    ? 'border-line-active'
                    : 'border-line-field'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              {value[index] ?? ''}
            </div>
          );
        })}
      </div>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        required
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
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
