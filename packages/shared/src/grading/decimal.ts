// Aritmética decimal del motor de notas (ERS §6: decimal.js). Módulo interno:
// no se exporta desde el barrel `./index`.
import Decimal from 'decimal.js';

/**
 * Constructor propio de `Decimal` para el motor: no toca la configuración
 * global (`Decimal.set`), así no afecta a otros módulos.
 *
 * - `rounding: ROUND_HALF_UP`: RN-03, .5 hacia arriba.
 * - `precision: 64`: el promedio es `suma / cantidad` con suma ≤ 20 × cantidad y
 *   2 decimales; la cantidad es la longitud de un arreglo (< 2^32), así que una
 *   racha de 9 o de 0 en la expansión del cociente no pasa de ~12 dígitos. Con
 *   64 dígitos significativos el redondeo a entero es el mismo que el exacto.
 */
export const GradeDecimal = Decimal.clone({
  precision: 64,
  rounding: Decimal.ROUND_HALF_UP,
});

/** Instancia del constructor del motor. */
export type GradeDecimal = InstanceType<typeof GradeDecimal>;

/** Centésimas enteras → nota decimal exacta (`1350` → `13.5`). */
export function centsToDecimal(cents: number): GradeDecimal {
  return new GradeDecimal(cents).dividedBy(100);
}

/** Nota decimal → centésimas enteras (`13.5` → `1350`). Exacto para 2 decimales. */
export function decimalToCents(value: GradeDecimal): number {
  return value.times(100).toNumber();
}
