'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CircleAlert, Loader2 } from 'lucide-react';
import { PasswordField } from '@/components/auth/password-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isValidUserCode, USER_CODE_LENGTH } from '@/lib/user-code';

type ApiError = { error?: { message?: string; details?: unknown[] } };

// RF-82: con el código de usuario se pide un código al correo verificado y, con él, se elige una
// contraseña nueva. La respuesta del primer paso es siempre la misma, exista o no el usuario.
export function RecoverForm() {
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [userCode, setUserCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

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

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidUserCode(userCode)) {
      setProblems([
        `El código de usuario debe tener ${USER_CODE_LENGTH} dígitos. Revisa que esté bien escrito.`,
      ]);
      return;
    }
    const { ok } = await post('recover/request', { code: userCode });
    if (ok) setStep('confirm');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <div className="grid gap-4">
        <p role="status" className="text-sm text-ink-2">
          Listo: cambiaste tu contraseña. Ya puedes iniciar sesión con la nueva.
        </p>
        <Link
          href="/login"
          className={buttonVariants({ variant: 'gold', className: 'h-11 text-base' })}
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  if (step === 'request') {
    return (
      <form onSubmit={request} className="grid gap-5" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor="user-code" className="text-sm font-medium text-ink">
            Código de usuario
          </label>
          <Input
            id="user-code"
            inputMode="numeric"
            maxLength={USER_CODE_LENGTH}
            required
            autoFocus
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.replace(/\D/g, ''))}
            disabled={pending}
            className="h-11 bg-surface tracking-widest tabular-nums"
          />
        </div>
        <Problems items={problems} />
        <Button type="submit" variant="gold" disabled={pending} className="h-11 text-base">
          {pending && <Spinner />}
          {pending ? 'Enviando…' : 'Enviar código a mi correo'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <p role="status" className="text-sm text-ink-2">
        Si el código de usuario es correcto y tiene un correo verificado, te enviamos un código de 6
        dígitos. Vale 5 minutos. Si no llega, revisa la carpeta de spam.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="email-code" className="text-sm font-medium text-ink">
          Código recibido por correo
        </label>
        <Input
          id="email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          value={emailCode}
          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
          disabled={pending}
          className="h-11 bg-surface text-center text-lg tracking-[0.4em] tabular-nums"
        />
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
        disabled={pending || emailCode.length !== 6}
        className="h-11 text-base"
      >
        {pending && <Spinner />}
        {pending ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep('request');
          setProblems([]);
        }}
        disabled={pending}
        className="min-h-11 text-sm text-brand underline-offset-2 hover:underline"
      >
        Pedir otro código
      </button>
    </form>
  );
}

function Spinner() {
  return <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
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
