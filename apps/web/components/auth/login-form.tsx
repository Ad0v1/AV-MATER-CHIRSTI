'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HOME_BY_ROLE, isRole } from '@/lib/roles';
import { isValidUserCode, USER_CODE_LENGTH } from '@/lib/user-code';

type ApiError = { error?: { code?: string; message?: string } };

export function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [recovery, setRecovery] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Un error de digitación se avisa aquí, sin ir al servidor ni contar como intento fallido.
    if (!isValidUserCode(code)) {
      setError(
        `El código de usuario debe tener ${USER_CODE_LENGTH} dígitos. Revisa que esté bien escrito.`,
      );
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          password,
          ...(needsTotp ? (useRecovery ? { recoveryCode: recovery } : { totp }) : {}),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          role?: unknown;
          mustAcceptPolicy?: boolean;
          mustChangePassword?: boolean;
          mustVerifyEmail?: boolean;
          mustEnableTwoFactor?: boolean;
          mustCompleteContact?: boolean;
        };
        // Pasos del primer ingreso, en orden: contraseña, política y correo (RF-71); el
        // administrador además activa el 2FA (RF-85). La API bloquea todo lo demás hasta
        // cumplirlos.
        const target = data.mustChangePassword
          ? '/cambiar-clave'
          : data.mustAcceptPolicy
            ? '/politica'
            : data.mustVerifyEmail
              ? '/verificar-correo'
              : data.mustEnableTwoFactor
                ? '/activar-2fa'
                : data.mustCompleteContact
                  ? '/mi-perfil'
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
      } else if (
        res.status === 401 &&
        !body.error?.code?.startsWith('TOTP') &&
        body.error?.code !== 'RECOVERY_CODE_INVALID'
      ) {
        setError('Código o contraseña incorrectos.');
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
        <label htmlFor="code" className="text-sm font-medium text-ink">
          Código de usuario
        </label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="username"
          maxLength={USER_CODE_LENGTH}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          disabled={pending || needsTotp}
          aria-describedby="code-help"
          className="h-11 bg-surface tracking-widest tabular-nums"
        />
        <p id="code-help" className="text-xs text-ink-3">
          Son {USER_CODE_LENGTH} dígitos y te lo entregó el colegio.
        </p>
      </div>

      <PasswordField
        id="password"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        disabled={pending || needsTotp}
      />

      {needsTotp && useRecovery && (
        <div className="grid gap-1.5">
          <label htmlFor="recovery" className="text-sm font-medium text-ink">
            Código de recuperación
          </label>
          <Input
            id="recovery"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            required
            autoFocus
            value={recovery}
            onChange={(e) => setRecovery(e.target.value.toUpperCase())}
            disabled={pending}
            aria-describedby="recovery-help"
            className="h-11 bg-surface text-center font-mono text-lg tracking-widest"
          />
          <p id="recovery-help" className="text-xs text-ink-3">
            Escribe uno de los códigos que guardaste al activar la verificación (XXXXX-XXXXX). Cada
            uno sirve una sola vez.
          </p>
        </div>
      )}

      {needsTotp && !useRecovery && (
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

      {needsTotp && (
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError(null);
          }}
          className="min-h-11 text-left text-sm text-brand underline-offset-2 hover:underline"
        >
          {useRecovery ? 'Usar el código de la aplicación' : 'Usar un código de recuperación'}
        </button>
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

      <p className="text-xs text-ink-3">
        Después de 5 intentos fallidos seguidos, el ingreso se bloquea 15 minutos.
      </p>
      <Link
        href="/recuperar"
        className="min-h-11 text-sm text-brand underline-offset-2 hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
