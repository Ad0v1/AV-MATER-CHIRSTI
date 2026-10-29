'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { HOME_BY_ROLE, type Role } from '@/lib/roles';

export function AcceptPolicyButton({ role }: { role: Role }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/policy/accept', { method: 'POST' });
      if (!res.ok) throw new Error('rechazado');
      router.replace(HOME_BY_ROLE[role]);
      router.refresh();
    } catch {
      setError('No se pudo registrar la aceptación. Inténtalo de nuevo.');
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={accept} disabled={pending}>
        {pending ? 'Registrando…' : 'Acepto la política y los términos'}
      </Button>
    </div>
  );
}
