import type { GradeEntry, GradeState } from './average';
import { GradingError } from './errors';
import { formatGrade, resolveNoSubmissionGrade, type GradeInput } from './grade-value';
import type { GradingScale } from '../academic/levels';
import {
  isGradeLiteral,
  isLiteralScale,
  resolveNoSubmissionLiteral,
  type GradeLiteralCode,
} from './literal-grade';

/**
 * Nota guardada en escala literal (INICIAL y PRIMARIA). La BD exige literal en GRADED y NE,
 * pero el motor tolera `null` en NE (NE sin literal, se muestra "NE").
 */
export type LiteralGradeEntry =
  | { readonly state: 'GRADED'; readonly literal: GradeLiteralCode }
  | { readonly state: 'NE'; readonly literal: GradeLiteralCode | null }
  | { readonly state: 'EXEMPT' };

/** Nota guardada en cualquiera de las dos escalas. */
export type StoredGradeEntry = GradeEntry | LiteralGradeEntry;

/**
 * Evaluación efectiva de un estudiante en una tarea, tal como se lee (A2, A6).
 * - `state: null`: sin nota (pendiente, por calificar o sin plazo vencido).
 * - `virtual`: NE calculada al leer porque la tarea venció sin entrega y aún
 *   no hay fila `Grade` (RF-44, A2). No se guarda.
 * - `needsRegrade`: hay una NE y luego llegó una entrega (tardía); el docente
 *   debe reemplazarla por una nota (RF-45).
 */
export interface EffectiveEntry {
  readonly state: GradeState | null;
  /** Nota con 2 decimales (`"13.50"`); `null` en `EXEMPT`, sin nota y en escala literal. */
  readonly value: string | null;
  /** Literal AD/A/B/C en escala literal; `null` en escala numérica, EXEMPT, sin nota o NE sin literal. */
  readonly literal: GradeLiteralCode | null;
  readonly virtual: boolean;
  readonly needsRegrade: boolean;
}

/** Datos de una celda para resolver su evaluación efectiva. */
export interface ResolveEffectiveEntryInput {
  /** Fila `Grade` guardada, o `null`/`undefined` si no hay. */
  readonly grade?: StoredGradeEntry | null;
  /** Hay al menos una versión de entrega aceptada. */
  readonly hasSubmission: boolean;
  readonly dueAt: Date;
  /** Instante de referencia (lo pasa la API; el motor no lee el reloj). */
  readonly now: Date;
  /** `Assignment.noSubmissionGrade`; `null` usa `"0.00"` (RN-05). */
  readonly noSubmissionGrade?: GradeInput | null;
  /**
   * La matrícula estaba vigente al vencer la tarea (`isNeEligible`). Si es
   * `false` no se genera NE virtual. Por defecto `true`.
   */
  readonly neEligible?: boolean;
  /** Escala del nivel de la sección (`scaleForLevel`). Por defecto `NUMERIC_0_20`. */
  readonly scale?: GradingScale;
  /** `Assignment.noSubmissionLiteral` (escala literal). */
  readonly noSubmissionLiteral?: GradeLiteralCode | null;
  /** Literal si la tarea no define uno; por defecto `DEFAULT_NO_SUBMISSION_LITERAL` (pendiente). */
  readonly defaultNoSubmissionLiteral?: GradeLiteralCode | null;
}

const NO_GRADE: EffectiveEntry = Object.freeze({
  state: null,
  value: null,
  literal: null,
  virtual: false,
  needsRegrade: false,
});

/** Fecha válida o lanza `INVALID_INPUT`. */
export function assertDate(value: unknown, name: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new GradingError('INVALID_INPUT', `${name} debe ser una fecha válida.`);
  }
  return value;
}

/** La tarea venció: `now` es posterior a `dueAt` (en `dueAt` exacto aún está a tiempo). */
export function isOverdue(dueAt: Date, now: Date): boolean {
  return assertDate(now, 'now').getTime() > assertDate(dueAt, 'dueAt').getTime();
}

/**
 * Evaluación efectiva de una celda (A2):
 * 1. Si hay `Grade` guardada, manda ella (normalizada a 2 decimales).
 *    Una NE con entrega posterior queda con `needsRegrade` (RF-45).
 * 2. Sin `Grade`, sin entrega, tarea vencida y matrícula elegible: NE virtual
 *    con la nota NE de la tarea (RF-44, RN-05).
 * 3. En otro caso, sin nota.
 * @throws GradingError `INVALID_GRADE`, `INVALID_STATE` o `INVALID_INPUT`.
 */
export function resolveEffectiveEntry(input: ResolveEffectiveEntryInput): EffectiveEntry {
  const { grade, hasSubmission, dueAt, now, noSubmissionGrade, neEligible = true } = input;
  const overdue = isOverdue(dueAt, now);
  if (isLiteralScale(input.scale)) return resolveLiteralEntry(input, overdue);

  if (grade !== null && grade !== undefined) {
    const state = (grade as { state?: unknown }).state;
    switch (state) {
      case 'GRADED':
        return {
          state: 'GRADED',
          value: formatGrade((grade as { value: GradeInput }).value),
          literal: null,
          virtual: false,
          needsRegrade: false,
        };
      case 'NE':
        return {
          state: 'NE',
          value: formatGrade((grade as { value: GradeInput }).value),
          literal: null,
          virtual: false,
          needsRegrade: hasSubmission,
        };
      case 'EXEMPT':
        return EXEMPT_ENTRY;
      default:
        throw new GradingError('INVALID_STATE', `Estado de nota desconocido: ${String(state)}`);
    }
  }

  if (!hasSubmission && overdue && neEligible) {
    return {
      state: 'NE',
      value: resolveNoSubmissionGrade(noSubmissionGrade),
      literal: null,
      virtual: true,
      needsRegrade: false,
    };
  }

  return NO_GRADE;
}

const EXEMPT_ENTRY: EffectiveEntry = Object.freeze({
  state: 'EXEMPT',
  value: null,
  literal: null,
  virtual: false,
  needsRegrade: false,
});

/** Escala literal: mismas reglas de A2/RF-44/RF-45, con literal en vez de número y sin promedio. */
function resolveLiteralEntry(input: ResolveEffectiveEntryInput, overdue: boolean): EffectiveEntry {
  const { grade, hasSubmission, neEligible = true } = input;
  if (grade !== null && grade !== undefined) {
    const state = (grade as { state?: unknown }).state;
    const literal = (grade as { literal?: unknown }).literal;
    switch (state) {
      case 'GRADED':
        if (!isGradeLiteral(literal)) {
          throw new GradingError('INVALID_GRADE', 'Una nota literal debe ser AD, A, B o C.');
        }
        return { state: 'GRADED', value: null, literal, virtual: false, needsRegrade: false };
      case 'NE':
        if (literal !== null && literal !== undefined && !isGradeLiteral(literal)) {
          throw new GradingError('INVALID_GRADE', 'Una nota literal debe ser AD, A, B o C.');
        }
        return {
          state: 'NE',
          value: null,
          literal: (literal as GradeLiteralCode | null | undefined) ?? null,
          virtual: false,
          needsRegrade: hasSubmission,
        };
      case 'EXEMPT':
        return EXEMPT_ENTRY;
      default:
        throw new GradingError('INVALID_STATE', `Estado de nota desconocido: ${String(state)}`);
    }
  }
  if (!hasSubmission && overdue && neEligible) {
    return {
      state: 'NE',
      value: null,
      literal: resolveNoSubmissionLiteral(
        input.noSubmissionLiteral,
        input.defaultNoSubmissionLiteral,
      ),
      virtual: true,
      needsRegrade: false,
    };
  }
  return NO_GRADE;
}

/** Vigencia de una matrícula: `[effectiveFrom, effectiveTo)`; `effectiveTo` nulo = vigente. */
export interface EnrollmentWindow {
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null;
}

/**
 * La matrícula estaba vigente al vencer la tarea, así que le corresponde NE
 * si no entregó. Intervalo semiabierto `[effectiveFrom, effectiveTo)`: en un
 * traslado, la anterior cierra en `at` y la nueva empieza en `at`, y una tarea
 * que vence justo en `at` le toca solo a la nueva.
 * @throws GradingError `INVALID_INPUT` si alguna fecha no es válida.
 */
export function isNeEligible(enrollment: EnrollmentWindow, dueAt: Date): boolean {
  const due = assertDate(dueAt, 'dueAt').getTime();
  const from = assertDate(enrollment.effectiveFrom, 'effectiveFrom').getTime();
  if (due < from) return false;
  if (enrollment.effectiveTo === null || enrollment.effectiveTo === undefined) return true;
  return due < assertDate(enrollment.effectiveTo, 'effectiveTo').getTime();
}
