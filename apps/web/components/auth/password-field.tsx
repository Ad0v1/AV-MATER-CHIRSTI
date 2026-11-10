'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from 'cn';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  describedBy?: string;
  placeholder?: string;
  inputClassName?: string;
  labelClassName?: string;
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
  placeholder,
  inputClassName,
  labelClassName,
}: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={cn('text-sm font-medium text-ink', labelClassName)}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          className={cn('h-11 bg-surface pr-11', inputClassName)}
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
