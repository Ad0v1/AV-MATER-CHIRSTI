'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ApiError = { error?: { message?: string; details?: unknown[] } };

// RF-83: el propio usuario registra su teléfono y su dirección. Solo el administrador los ve.
// El apoderado debe dar su teléfono antes de usar el sistema; para el alumno son opcionales.
export function ProfileForm({
  phone,
  address,
  phoneRequired,
  pending,
  homePath,
}: {
  phone: string | null;
  address: string | null;
  phoneRequired: boolean;
  /** Verdadero si es un paso pendiente del primer ingreso: al guardar, entra al sistema. */
  pending: boolean;
  homePath: string;
}) {
  const router = useRouter();
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const [addressValue, setAddressValue] = useState(address ?? '');
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblems([]);
    setSaved(false);
    const digits = phoneValue.replace(/\s+/g, '');
    if (phoneRequired && !/^\d{9}$/.test(digits)) {
      setProblems(['El teléfono es obligatorio y debe tener 9 dígitos.']);
      return;
    }
    if (digits !== '' && !/^\d{9}$/.test(digits)) {
      setProblems(['El teléfono debe tener 9 dígitos.']);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: digits === '' ? null : digits,
          address: addressValue.trim() === '' ? null : addressValue.trim(),
        }),
      });
      if (res.ok) {
        if (pending) {
          router.replace(homePath);
        } else {
          setSaved(true);
        }
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as ApiError;
      if (res.status === 401) {
        router.replace('/login');
      } else if (Array.isArray(body.error?.details) && body.error.details.length > 0) {
        setProblems(body.error.details.map(String));
      } else {
        setProblems([body.error?.message ?? 'No se pudo guardar. Inténtalo de nuevo.']);
      }
    } catch {
      setProblems(['No hay conexión con el servidor. Inténtalo de nuevo.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor="phone" className="text-sm font-medium text-ink">
          Teléfono {phoneRequired ? '' : '(opcional)'}
        </label>
        <Input
          id="phone"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={9}
          required={phoneRequired}
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value.replace(/\D/g, ''))}
          disabled={busy}
          aria-describedby="phone-help"
          className="h-11 bg-surface tabular-nums"
        />
        <p id="phone-help" className="text-xs text-ink-3">
          9 dígitos. Solo lo ve el administrador del colegio.
        </p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="address" className="text-sm font-medium text-ink">
          Dirección (opcional)
        </label>
        <Input
          id="address"
          autoComplete="street-address"
          maxLength={255}
          value={addressValue}
          onChange={(e) => setAddressValue(e.target.value)}
          disabled={busy}
          className="h-11 bg-surface"
        />
      </div>

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
      {saved && (
        <p role="status" className="text-sm text-ink-2">
          Datos guardados.
        </p>
      )}

      <Button type="submit" variant="gold" disabled={busy} className="h-11 text-base">
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {busy ? 'Guardando…' : pending ? 'Guardar y continuar' : 'Guardar'}
      </Button>
    </form>
  );
}
