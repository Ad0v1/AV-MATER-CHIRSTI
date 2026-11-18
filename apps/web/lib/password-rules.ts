// Reglas visibles al elegir una contraseña nueva y medidor de fortaleza. La API sigue siendo la
// fuente de verdad (RF-73: claves comunes, código de usuario y DNI); esto solo guía al usuario.

export const PASSWORD_MIN_LENGTH = 8;

// Caracteres que no se admiten en la contraseña nueva.
export const FORBIDDEN_CHARS = '\'\\¿"ºª.,´çñÑ';
const FORBIDDEN_SET = new Set(FORBIDDEN_CHARS);

export type PasswordRule = { id: string; label: string; met: boolean };

export function evaluatePassword(password: string): PasswordRule[] {
  return [
    {
      id: 'length',
      label: `Mín. ${PASSWORD_MIN_LENGTH} caracteres`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: 'upper', label: '1 mayúscula', met: /[A-Z]/.test(password) },
    { id: 'lower', label: '1 minúscula', met: /[a-z]/.test(password) },
    { id: 'number', label: '1 número', met: /\d/.test(password) },
    { id: 'nospace', label: 'Sin espacios', met: password.length > 0 && !/\s/.test(password) },
    {
      id: 'forbidden',
      label: `Sin usar ${[...FORBIDDEN_CHARS].join(' ')}`,
      met: password.length > 0 && ![...password].some((c) => FORBIDDEN_SET.has(c)),
    },
  ];
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABELS: Record<StrengthLevel, string> = {
  0: 'Escribe tu contraseña',
  1: 'Débil',
  2: 'Regular',
  3: 'Buena',
  4: 'Fuerte',
};

export function passwordStrength(password: string): StrengthLevel {
  if (!password) return 0;
  const rules = evaluatePassword(password);
  const met = rules.filter((r) => r.met).length;
  if (met < rules.length) return met <= 3 ? 1 : 2;
  // Cumple todo: se premia la longitud y los símbolos.
  const bonus = Number(password.length >= 12) + Number(/[^A-Za-z0-9]/.test(password));
  return bonus >= 1 ? 4 : 3;
}

export const allRulesMet = (password: string) => evaluatePassword(password).every((r) => r.met);
