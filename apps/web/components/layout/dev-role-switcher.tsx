'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';
import { setDevRole } from '@/components/layout/actions';

// Solo desarrollo: permite ver el menu de cada rol sin login.
export function DevRoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="grid gap-1 text-xs text-sidebar-foreground/70">
      Rol simulado (solo desarrollo)
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
        value={role}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await setDevRole(e.target.value);
            router.refresh();
          })
        }
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
