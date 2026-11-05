import type { LiteralScaleIssue } from './literal-scale';

/** Códigos de error del motor de notas. */
export type GradingErrorCode =
  'INVALID_GRADE' | 'INVALID_STATE' | 'INVALID_SCALE' | 'INVALID_INPUT';

/**
 * Error del motor de notas. La API lo traduce a una respuesta de validación;
 * `issues` solo trae datos con `INVALID_SCALE`.
 */
export class GradingError extends Error {
  constructor(
    readonly code: GradingErrorCode,
    message: string,
    readonly issues: readonly LiteralScaleIssue[] = [],
  ) {
    super(message);
    this.name = 'GradingError';
  }
}
