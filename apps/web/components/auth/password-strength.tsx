import { Check, Lock, X } from 'lucide-react';
import {
  STRENGTH_LABELS,
  evaluatePassword,
  passwordStrength,
  type StrengthLevel,
} from '@/lib/password-rules';

const COLORS: Record<StrengthLevel, { bar: string; text: string }> = {
  0: { bar: 'bg-line', text: 'text-ink-3' },
  1: { bar: 'bg-danger', text: 'text-danger' },
  2: { bar: 'bg-orange-500', text: 'text-warning' },
  3: { bar: 'bg-lime-500', text: 'text-success' },
  4: { bar: 'bg-success', text: 'text-success' },
};

// Requisitos de la contraseña: barra por segmentos (rojo → verde), contador y lista que marca cada
// requisito al cumplirlo.
export function PasswordStrength({ password, id }: { password: string; id: string }) {
  const level = passwordStrength(password);
  const rules = evaluatePassword(password);
  const met = rules.filter((r) => r.met).length;
  const color = COLORS[level];

  return (
    <div id={id} className="grid gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Lock className="size-4 text-ink-2" aria-hidden="true" />
          La contraseña debe incluir:
        </p>
        <p
          role="status"
          aria-live="polite"
          className={`text-xs font-semibold tabular-nums transition-colors motion-reduce:transition-none ${color.text}`}
        >
          {level > 0 && <span>{STRENGTH_LABELS[level]} · </span>}
          {met} de {rules.length}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Requisitos cumplidos"
        aria-valuemin={0}
        aria-valuemax={rules.length}
        aria-valuenow={met}
        aria-valuetext={`${met} de ${rules.length} requisitos. ${STRENGTH_LABELS[level]}`}
        className="grid grid-cols-6 gap-1.5"
      >
        {rules.map((rule, index) => (
          <span
            key={rule.id}
            className={`h-1.5 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
              index < met ? color.bar : 'bg-line'
            }`}
          />
        ))}
      </div>

      <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-start gap-2 transition-colors motion-reduce:transition-none ${
              rule.met ? 'text-success' : 'text-ink-2'
            } ${rule.id === 'forbidden' ? 'sm:col-span-2' : ''}`}
          >
            {rule.met ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            )}
            <span className="min-w-0 break-words">
              {rule.label}
              <span className="sr-only">{rule.met ? ' (cumplido)' : ' (pendiente)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
