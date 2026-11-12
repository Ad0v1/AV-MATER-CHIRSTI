import type { GradingScale } from '../academic/levels';

// Escala literal AD/A/B/C de INICIAL y PRIMARIA (CNEB; decisión 1 del usuario, 09/11/2026).
// En esta escala no hay promedio aritmético: el resumen del período es el logro que elige el
// docente (PeriodAchievement, decisión 2). Debe coincidir con `enum GradeLiteral` de Prisma.

export const GRADE_LITERALS = ['AD', 'A', 'B', 'C'] as const;
export type GradeLiteralCode = (typeof GRADE_LITERALS)[number];

/** Literal que se considera en riesgo en la escala literal. */
export const LITERAL_RISK: GradeLiteralCode = 'C';

/**
 * Literal por defecto de la NE automática en escala literal cuando la tarea no define
 * `noSubmissionLiteral`. `null` = la NE queda sin literal y se muestra "NE".
 * PENDIENTE: el usuario aún no decidió el literal por defecto (09/11/2026).
 */
export const DEFAULT_NO_SUBMISSION_LITERAL: GradeLiteralCode | null = null;

export function isGradeLiteral(value: unknown): value is GradeLiteralCode {
  return typeof value === 'string' && (GRADE_LITERALS as readonly string[]).includes(value);
}

export function isLiteralScale(scale: GradingScale | undefined): boolean {
  return scale === 'LITERAL_ADABC';
}

/**
 * Literal de la NE automática (RN-05 en escala literal): el de la tarea o, si es nulo, el
 * `fallback` configurable (por defecto `DEFAULT_NO_SUBMISSION_LITERAL`).
 */
export function resolveNoSubmissionLiteral(
  configured?: GradeLiteralCode | null,
  fallback: GradeLiteralCode | null = DEFAULT_NO_SUBMISSION_LITERAL,
): GradeLiteralCode | null {
  if (configured !== null && configured !== undefined) return configured;
  return fallback;
}
