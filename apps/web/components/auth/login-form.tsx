'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HOME_BY_ROLE, isRole } from '@/lib/roles';

type ApiError = { error?: { code?: string; message?: string } };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(needsTotp ? { totp } : {}) }),
      });

      if (res.ok) {
        const data = (await res.json()) as { role?: unknown; mustAcceptPolicy?: boolean };
        const target = data.mustAcceptPolicy
          ? '/politica'
          : isRole(data.role)
            ? HOME_BY_ROLE[data.role]
            : '/';
        router.replace(target);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => ({}))) as ApiError;
      if (body.error?.code === 'TOTP_REQUIRED') {
        // La contraseña fue correcta: se pide el segundo factor sin repetir el mensaje de error.
        setNeedsTotp(true);
        return;
      }
      if (res.status === 429) {
        setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      } else {
        setError(body.error?.message ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Correo institucional
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending || needsTotp}
          className="h-11 bg-surface"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Contraseña
        </label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending || needsTotp}
            className="h-11 bg-surface pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={pending || needsTotp}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-ink-3 outline-none hover:text-brand focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-ink-disabled"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {needsTotp && (
        <div className="grid gap-1.5">
          <label htmlFor="totp" className="text-sm font-medium text-ink">
            Código de verificación
          </label>
          <Input
            id="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
            disabled={pending}
            aria-describedby="totp-help"
            className="h-11 bg-surface text-center text-lg tracking-[0.4em] tabular-nums"
          />
          <p id="totp-help" className="text-xs text-ink-3">
            Ingresa los 6 dígitos de tu aplicación autenticadora.
          </p>
        </div>
      )}

      {error && (
        <p
          id="login-error"
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <Button type="submit" variant="gold" disabled={pending} className="h-11 text-base">
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pending ? 'Ingresando…' : needsTotp ? 'Verificar e ingresar' : 'Ingresar'}
      </Button>
    </form>
  );
}
