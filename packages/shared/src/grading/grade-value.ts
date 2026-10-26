import { GradingError } from './errors';

/** Nota mínima permitida (RN-01). */
export const GRADE_MIN = 0;
/** Nota máxima permitida (RN-01). */
export const GRADE_MAX = 20;
/** Nota NE predeterminada cuando la tarea no configura otra (RN-05). */
export const DEFAULT_NO_SUBMISSION_GRADE = '0.00';

/** Nota tal como llega de la API o de la base de datos: `"13.50"` o `13.5`. */
export type GradeInput = string | number;

/** Nota en centésimas enteras (0..2000). Solo se obtiene con `parseGrade`. */
export type GradeCents = number & { readonly __brand: 'GradeCents' };

const GRADE_PATTERN = /^\d{1,2}(\.\d{1,2})?$/;
const MAX_CENTS = GRADE_MAX * 100;

/**
 * Convierte una nota a centésimas enteras validando RN-01: 0..20 con hasta
 * 2 decimales. No usa coma flotante para el cálculo.
 * @throws GradingError `INVALID_GRADE` si no es una nota válida.
 */
export function parseGrade(input: GradeInput): GradeCents {
  let text: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalidGrade(input);
    text = String(input);
  } else if (typeof input === 'string') {
    text = input;
  } else {
    throw invalidGrade(input);
  }

  if (!GRADE_PATTERN.test(text)) throw invalidGrade(input);

  const [intPart, fracPart = ''] = text.split('.');
  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  if (cents > MAX_CENTS) throw invalidGrade(input);
  return cents as GradeCents;
}

/** Indica si el valor es una nota válida según RN-01, sin lanzar. */
export function isValidGrade(input: unknown): boolean {
  if (typeof input !== 'string' && typeof input !== 'number') return false;
  try {
    parseGrade(input);
    return true;
  } catch {
    return false;
  }
}

/** Devuelve la nota normalizada con 2 decimales (`13.5` → `"13.50"`). */
export function formatGrade(input: GradeInput): string {
  const cents = parseGrade(input);
  const whole = (cents - (cents % 100)) / 100;
  return `${whole}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Nota NE de una tarea (RN-05): la configurada en la tarea o, si no hay,
 * `"0.00"`. Siempre devuelve 2 decimales.
 * @throws GradingError `INVALID_GRADE` si la configurada no cumple RN-01.
 */
export function resolveNoSubmissionGrade(configured?: GradeInput | null): string {
  if (configured === undefined || configured === null) return DEFAULT_NO_SUBMISSION_GRADE;
  return formatGrade(configured);
}

function invalidGrade(input: unknown): GradingError {
  return new GradingError(
    'INVALID_GRADE',
    `Nota inválida: ${String(input)}. Debe estar entre ${GRADE_MIN} y ${GRADE_MAX} con hasta 2 decimales.`,
  );
}
