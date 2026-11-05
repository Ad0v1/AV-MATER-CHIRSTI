'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  describedBy?: string;
};

// Campo de contraseña con botón para mostrarla u ocultarla (compartido por el login y el cambio de clave).
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  describedBy,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          className="h-11 bg-surface pr-11"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          disabled={disabled}
          aria-label={show ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-ink-3 outline-none hover:text-brand focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-ink-disabled"
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
