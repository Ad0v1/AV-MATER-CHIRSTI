'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';

type ApiError = { error?: { code?: string; message?: string; details?: unknown[] } };

const MIN_LENGTH = 8;

// Cambio de contraseña (RF-71, RF-72). La política completa (RF-73) la comprueba la API; aquí solo
// se evitan viajes inútiles y se muestran sus mensajes.
export function ChangePasswordForm({ homePath }: { homePath: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblems([]);
    if (next.length < MIN_LENGTH) {
      setProblems([`La contraseña nueva debe tener al menos ${MIN_LENGTH} caracteres.`]);
      return;
    }
    if (next !== confirm) {
      setProblems(['La confirmación no coincide con la contraseña nueva.']);
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        router.replace(homePath);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as ApiError;
      if (res.status === 429) {
        setProblems(['Demasiados intentos. Espera un minuto e inténtalo de nuevo.']);
      } else if (res.status === 401) {
        // La sesión caducó: se vuelve al login.
        router.replace('/login');
      } else if (Array.isArray(body.error?.details) && body.error.details.length > 0) {
        setProblems(body.error.details.map(String));
      } else {
        setProblems([
          body.error?.message ?? 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
        ]);
      }
    } catch {
      setProblems(['No hay conexión con el servidor. Inténtalo de nuevo.']);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <PasswordField
        id="current-password"
        label="Contraseña actual"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        disabled={pending}
      />
      <PasswordField
        id="new-password"
        label="Contraseña nueva"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        disabled={pending}
        describedBy="password-rules"
      />
      <PasswordField
        id="confirm-password"
        label="Repite la contraseña nueva"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        disabled={pending}
      />
      <p id="password-rules" className="text-xs text-ink-3">
        Mínimo {MIN_LENGTH} caracteres. No uses tu código de usuario, tu DNI ni una clave común como
        «12345678».
      </p>

      {problems.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <ul className="grid gap-1">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      <Button type="submit" variant="gold" disabled={pending} className="h-11 text-base">
        {pending && (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
        {pending ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}
