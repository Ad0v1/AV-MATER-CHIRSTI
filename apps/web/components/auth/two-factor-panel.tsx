'use client';

import { useState, type FormEvent } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ApiError = { error?: { message?: string } };

// RF-85: el administrador ve cuántos códigos de recuperación le quedan y puede pedir un juego
// nuevo con un código vigente de su aplicación (los anteriores dejan de valer).
export function TwoFactorPanel({ recoveryCodesLeft }: { recoveryCodesLeft: number }) {
  const [left, setLeft] = useState(recoveryCodesLeft);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/2fa/recovery-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        setError(
          res.status === 429
            ? 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.'
            : (data.error?.message ?? 'No se pudieron generar los códigos.'),
        );
        return;
      }
      const data = (await res.json()) as { recoveryCodes?: string[] };
      setCodes(data.recoveryCodes ?? []);
      setLeft(data.recoveryCodes?.length ?? 0);
      setCode('');
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="dos-pasos-titulo" className="mt-6 border-t border-line pt-4">
      <h2 id="dos-pasos-titulo" className="text-lg font-semibold text-ink">
        Verificación en dos pasos
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Activa. Te quedan {left} {left === 1 ? 'código' : 'códigos'} de recuperación sin usar.
      </p>

      {codes ? (
        <div className="mt-4">
          <RecoveryCodesView
            codes={codes}
            actionLabel="Listo"
            onDone={() => {
              setCodes(null);
              setOpen(false);
            }}
          />
        </div>
      ) : open ? (
        <form onSubmit={regenerate} className="mt-4 grid gap-3" noValidate>
          <p className="text-sm text-ink-2">
            Los códigos anteriores dejarán de servir. Escribe el código de 6 dígitos de tu
            aplicación para confirmar.
          </p>
          <Input
            aria-label="Código de verificación"
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
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-11" disabled={pending || code.length !== 6}>
              {pending && (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              Generar códigos nuevos
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setError(null);
                setCode('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          onClick={() => setOpen(true)}
        >
          Generar códigos de recuperación nuevos
        </Button>
      )}
    </section>
  );
}
