// Validación común de las pantallas de administración (lógica pura, probada con Vitest).
// La API sigue siendo la autoridad: esto solo evita viajes inútiles y da mensajes junto al campo.

export type ReasonLimits = { required: boolean; min: number; max: number };

/** Aviso fijo que acompaña a cada campo de motivo (docs/03, bitácora académica y de usuarios). */
export const REASON_NOTICE =
  'El motivo queda en la bitácora. No escribas nombres, notas ni datos personales de estudiantes.';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/**
 * true solo para un booleano real. Los argumentos ligados (`.bind`) de una Server Action llegan
 * del navegador y se pueden manipular ("true", 1, null): se rechazan.
 */
export const isStrictBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** Longitud que cuenta la API (Zod: trim y luego length). */
export const reasonLength = (value: string): number => value.trim().length;

/** Error del motivo o null si es válido. Mismos límites que la API. */
export function validateReason(value: string, limits: ReasonLimits): string | null {
  const length = reasonLength(value);
  if (length === 0) {
    return limits.required ? `Escribe el motivo (mínimo ${limits.min} caracteres).` : null;
  }
  if (length < limits.min) return `El motivo debe tener al menos ${limits.min} caracteres.`;
  if (length > limits.max) return `El motivo no puede pasar de ${limits.max} caracteres.`;
  return null;
}

/** Texto del contador junto al campo de motivo. */
export function reasonCounter(value: string, limits: ReasonLimits): string {
  return `${reasonLength(value)} de ${limits.max} caracteres${
    limits.required ? ` (mínimo ${limits.min})` : ''
  }`;
}
