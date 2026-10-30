import { centsToDecimal, decimalToCents, GradeDecimal } from './decimal';
import { GradingError } from './errors';
import { parseGrade, type GradeInput } from './grade-value';

/** Estado de la evaluación de un estudiante en una tarea (docs/04). */
export type GradeState = 'GRADED' | 'NE' | 'EXEMPT';

/**
 * Una evaluación que entra al cálculo del promedio.
 * - `GRADED`: nota puesta por el docente.
 * - `NE`: no entregó; `value` es la nota NE de la tarea (RN-05).
 * - `EXEMPT`: exonerado; no lleva valor y no cuenta (RN-07).
 *
 * RN-06: no existe `isLate` ni penalización. Una entrega tardía se califica
 * como cualquier otra (`GRADED`) y el motor nunca descuenta puntos.
 */
export type GradeEntry =
  | { readonly state: 'GRADED'; readonly value: GradeInput }
  | { readonly state: 'NE'; readonly value: GradeInput }
  | { readonly state: 'EXEMPT' };

/** Resultado del promedio. Sin notas que cuenten devuelve `NO_GRADES`, nunca 0. */
export type AverageResult =
  | {
      readonly status: 'OK';
      /** Promedio redondeado una sola vez a entero (RN-03). */
      readonly rounded: number;
      /** Suma exacta en centésimas de las notas que cuentan. */
      readonly sumCents: number;
      /** Cantidad de notas que cuentan (GRADED + NE). */
      readonly counted: number;
      /** Cantidad de exoneraciones ignoradas. */
      readonly exempt: number;
    }
  | { readonly status: 'NO_GRADES'; readonly counted: 0; readonly exempt: number };

/**
 * Promedio simple sin ponderación (RN-02) de las notas GRADED y NE (RN-05),
 * excluyendo EXEMPT (RN-07). Suma y divide con `decimal.js` (sin coma
 * flotante) y redondea una sola vez a entero, .5 hacia arriba (RN-03).
 * Sin descuento por tardía (RN-06).
 * No muta la entrada.
 * @throws GradingError `INVALID_STATE` ante un estado desconocido,
 *   `INVALID_GRADE` ante una nota que no cumple RN-01.
 */
export function calculateAverage(entries: readonly GradeEntry[]): AverageResult {
  let sum = new GradeDecimal(0);
  let counted = 0;
  let exempt = 0;

  for (const entry of entries) {
    const state = (entry as { state?: unknown } | null | undefined)?.state;
    switch (state) {
      case 'EXEMPT':
        exempt += 1;
        break;
      case 'GRADED':
      case 'NE':
        sum = sum.plus(centsToDecimal(parseGrade((entry as { value: GradeInput }).value)));
        counted += 1;
        break;
      default:
        throw new GradingError('INVALID_STATE', `Estado de nota desconocido: ${String(state)}`);
    }
  }

  if (counted === 0) return { status: 'NO_GRADES', counted: 0, exempt };

  // Único redondeo del cálculo (RN-03): suma / cantidad → entero, ROUND_HALF_UP.
  const rounded = sum.dividedBy(counted).toDecimalPlaces(0, GradeDecimal.ROUND_HALF_UP).toNumber();

  return { status: 'OK', rounded, sumCents: decimalToCents(sum), counted, exempt };
}
