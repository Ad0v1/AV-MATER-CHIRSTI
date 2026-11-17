'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, MailCheck, PartyPopper, UserRound } from 'lucide-react';
import { PasswordField } from '@/components/auth/password-field';
import { CodeInput, CodeTimer, Spinner } from '@/components/auth/verify-email-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidUserCode, USER_CODE_LENGTH } from '@/lib/user-code';

const RESEND_SECONDS = 60;
// Igual que CODE_TTL_SECONDS de la API: el código vale 5 minutos desde que se envía.
const CODE_TTL_SECONDS = 5 * 60;
const CODE_LENGTH = 6;

type ApiError = { error?: { message?: string; details?: unknown[] } };
type Step = 'request' | 'confirm' | 'done';

// RF-82: con el código de usuario se pide un código al correo verificado y, con él, se elige una
// contraseña nueva. La respuesta del primer paso es siempre la misma, exista o no el usuario.
// No hay enlace con token en la URL: el código de un solo uso (5 min, con límite de intentos) lo
// valida la API, por eso la ruta pública no necesita ser un identificador secreto.
export function RecoverForm() {
  const [step, setStep] = useState<Step>('request');
  const [userCode, setUserCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);

  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = step === 'confirm' && expiresAt > 0 && remaining === 0;

  // Reloj del código: se calcula con la hora real para no desfasarse.
  useEffect(() => {
    if (step !== 'confirm' || expiresAt === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, expiresAt]);

  // Cuenta regresiva del botón de reenvío (la API vuelve a limitar el reenvío).
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function post(path: string, body: object): Promise<{ ok: boolean; data: ApiError }> {
    setProblems([]);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = res.ok ? {} : ((await res.json().catch(() => ({}))) as ApiError);
      if (!res.ok && res.status === 429) {
        setProblems(['Demasiados intentos. Espera un minuto e inténtalo de nuevo.']);
      }
      return { ok: res.ok, data };
    } catch {
      setProblems(['No hay conexión con el servidor. Inténtalo de nuevo.']);
      return { ok: false, data: {} };
    } finally {
      setPending(false);
    }
  }

  async function request(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!isValidUserCode(userCode)) {
      setProblems([
        `El código de usuario debe tener ${USER_CODE_LENGTH} dígitos. Revisa que esté bien escrito.`,
      ]);
      return;
    }
    const { ok } = await post('recover/request', { code: userCode });
    if (ok) {
      setStep('confirm');
      setEmailCode('');
      setWait(RESEND_SECONDS);
      const start = Date.now();
      setNow(start);
      setExpiresAt(start + CODE_TTL_SECONDS * 1000);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (expired) {
      setProblems(['El código venció. Pide uno nuevo con «Reenviar código».']);
      return;
    }
    if (password !== confirm) {
      setProblems(['La confirmación no coincide con la contraseña nueva.']);
      return;
    }
    const { ok, data } = await post('recover/confirm', {
      code: userCode,
      emailCode,
      newPassword: password,
    });
    if (ok) {
      setStep('done');
    } else if (Array.isArray(data.error?.details) && data.error.details.length > 0) {
      setProblems(data.error.details.map(String));
    } else if (data.error?.message) {
      setProblems([data.error.message]);
    }
  }

  if (step === 'done') {
    return (
      <div className="grid gap-6">
        <Stepper step={step} />
        <div role="status" className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
            <PartyPopper className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">¡Contraseña actualizada!</p>
            <p className="mt-0.5 text-ink-2">Ya puedes iniciar sesión con tu contraseña nueva.</p>
          </div>
        </div>
        <Link
          href="/login"
          className={buttonVariants({ variant: 'gold', className: 'h-12 text-base' })}
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  if (step === 'request') {
    return (
      <div className="grid gap-6">
        <Stepper step={step} />
        <form onSubmit={request} className="grid gap-5" noValidate>
          <div className="grid gap-1.5">
            <label htmlFor="user-code" className="text-sm font-medium text-ink">
              Código de usuario
            </label>
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden="true"
              />
              <Input
                id="user-code"
                inputMode="numeric"
                autoComplete="username"
                maxLength={USER_CODE_LENGTH}
                required
                autoFocus
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.replace(/\D/g, ''))}
                disabled={pending}
                aria-describedby="user-code-help"
                className="h-12 bg-surface pl-10 tracking-widest tabular-nums"
              />
            </div>
            <p id="user-code-help" className="text-xs text-ink-3">
              Es el mismo código de {USER_CODE_LENGTH} dígitos con el que inicias sesión.
            </p>
          </div>
          <Problems items={problems} />
          <Button type="submit" variant="gold" disabled={pending} className="h-12 text-base">
            {pending && <Spinner />}
            {pending ? 'Enviando…' : 'Enviar código a mi correo'}
          </Button>
        </form>
      </div>
    );
  }

  const blocked = emailCode.length !== CODE_LENGTH || expired;
  const linkClass =
    'min-h-11 rounded-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active disabled:cursor-not-allowed disabled:text-ink-disabled disabled:no-underline';

  return (
    <div className="grid gap-6">
      <Stepper step={step} />
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <div role="status" className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
            <MailCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">Revisa tu correo</p>
            <p className="mt-0.5 text-ink-2">
              Si el código de usuario es correcto y tiene un correo verificado, te enviamos un
              código de 6 dígitos. Si no llega, revisa la carpeta de spam.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor="email-code" className="text-sm font-medium text-ink">
            Código recibido por correo
          </label>
          <CodeInput
            id="email-code"
            value={emailCode}
            onChange={setEmailCode}
            disabled={pending || expired}
          />
          <CodeTimer remaining={remaining} total={CODE_TTL_SECONDS} />
        </div>

        <PasswordField
          id="recover-password"
          label="Contraseña nueva"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={pending}
        />
        <PasswordField
          id="recover-confirm"
          label="Repite la contraseña nueva"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          disabled={pending}
        />
        <Problems items={problems} />
        <Button
          type="submit"
          variant="gold"
          disabled={pending}
          aria-disabled={blocked || pending}
          className={`h-12 text-base ${
            blocked && !pending ? 'cursor-not-allowed opacity-50 hover:bg-gold' : ''
          }`}
        >
          {pending && <Spinner />}
          {pending ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => void request()}
            disabled={pending || wait > 0}
            className={linkClass}
          >
            {wait > 0 ? `Reenviar código en ${wait} s` : 'Reenviar código'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('request');
              setProblems([]);
            }}
            disabled={pending}
            className={linkClass}
          >
            Cambiar código de usuario
          </button>
        </div>
      </form>
    </div>
  );
}

// Indicador de los tres pasos: usuario, código con contraseña nueva, y listo.
function Stepper({ step }: { step: Step }) {
  const steps = [
    { id: 'request', label: 'Tu usuario' },
    { id: 'confirm', label: 'Código y clave' },
    { id: 'done', label: 'Listo' },
  ] as const;
  const current = steps.findIndex((item) => item.id === step);

  return (
    <ol className="flex items-center gap-3" aria-label="Progreso de la recuperación">
      {steps.map((item, index) => {
        const done = index < current || step === 'done';
        const active = index === current && step !== 'done';
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

function Problems({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <ul className="grid gap-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
