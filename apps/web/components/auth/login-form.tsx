'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
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
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending || needsTotp}
        />
      </div>

      {needsTotp && (
        <div className="grid gap-1.5">
          <label htmlFor="totp" className="text-sm font-medium">
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
          />
          <p id="totp-help" className="text-xs text-muted-foreground">
            Ingresa los 6 dígitos de tu aplicación autenticadora.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Ingresando…' : needsTotp ? 'Verificar e ingresar' : 'Ingresar'}
      </Button>
    </form>
  );
}
