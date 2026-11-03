import { GradingError } from './errors';
import { GRADE_MAX, GRADE_MIN } from './grade-value';

/** Tramo de la tabla de literales: `min..max` inclusive, en enteros. */
export interface LiteralBand {
  readonly literal: string;
  readonly min: number;
  readonly max: number;
}

/** Tabla de literales (RN-04). El orden de los tramos no importa. */
export type LiteralScale = readonly LiteralBand[];

/** Tipos de problema que puede tener una tabla de literales. */
export type LiteralScaleIssueCode =
  | 'EMPTY'
  | 'NOT_INTEGER'
  | 'OUT_OF_RANGE'
  | 'MIN_GT_MAX'
  | 'EMPTY_LITERAL'
  | 'DUPLICATE_LITERAL'
  | 'GAP'
  | 'OVERLAP'
  | 'NOT_FROM_0'
  | 'NOT_TO_20';

/** Problema encontrado en una tabla; `index` es la posición del tramo en la entrada. */
export interface LiteralScaleIssue {
  readonly code: LiteralScaleIssueCode;
  readonly index?: number;
  readonly message: string;
}

/** Tabla por defecto (RN-04): AD 18..20, A 14..17, B 11..13, C 0..10. Inmutable. */
export const DEFAULT_LITERAL_SCALE: LiteralScale = Object.freeze([
  Object.freeze({ literal: 'AD', min: 18, max: 20 }),
  Object.freeze({ literal: 'A', min: 14, max: 17 }),
  Object.freeze({ literal: 'B', min: 11, max: 13 }),
  Object.freeze({ literal: 'C', min: 0, max: 10 }),
]);

/**
 * Valida una tabla de literales (RN-04) y devuelve la lista de problemas
 * (vacía si es válida). Debe cubrir 0..20 en enteros, sin huecos ni cruces
 * y sin literales repetidos. No muta la entrada.
 */
export function validateLiteralScale(scale: LiteralScale): LiteralScaleIssue[] {
  if (!Array.isArray(scale) || scale.length === 0) {
    return [{ code: 'EMPTY', message: 'La tabla de literales está vacía.' }];
  }

  const issues: LiteralScaleIssue[] = [];
  const seen = new Set<string>();
  let bandsOk = true;

  scale.forEach((band: Partial<LiteralBand> | null | undefined, index) => {
    const literal = typeof band?.literal === 'string' ? band.literal.trim().toUpperCase() : '';
    if (literal === '') {
      issues.push({ code: 'EMPTY_LITERAL', index, message: `Tramo ${index}: literal vacío.` });
    } else if (seen.has(literal)) {
      issues.push({
        code: 'DUPLICATE_LITERAL',
        index,
        message: `Tramo ${index}: literal repetido "${literal}".`,
      });
    } else {
      seen.add(literal);
    }

    const min = band?.min;
    const max = band?.max;
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      issues.push({
        code: 'NOT_INTEGER',
        index,
        message: `Tramo ${index}: min y max deben ser enteros.`,
      });
      bandsOk = false;
    } else if ((min as number) < GRADE_MIN || (max as number) > GRADE_MAX) {
      issues.push({
        code: 'OUT_OF_RANGE',
        index,
        message: `Tramo ${index}: debe estar dentro de ${GRADE_MIN}..${GRADE_MAX}.`,
      });
      bandsOk = false;
    } else if ((min as number) > (max as number)) {
      issues.push({ code: 'MIN_GT_MAX', index, message: `Tramo ${index}: min mayor que max.` });
      bandsOk = false;
    }
  });

  // La cobertura 0..20 solo se revisa si cada tramo es válido por sí mismo.
  if (!bandsOk) return issues;

  const sorted = [...scale].sort((a, b) => a.min - b.min || a.max - b.max);
  if (sorted[0].min !== GRADE_MIN) {
    issues.push({ code: 'NOT_FROM_0', message: `La tabla debe empezar en ${GRADE_MIN}.` });
  }
  let reach = sorted[0].max;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.min <= reach) {
      issues.push({
        code: 'OVERLAP',
        message: `El tramo ${next.literal} se cruza con otro tramo (${next.min} ya está cubierto).`,
      });
    } else if (next.min > reach + 1) {
      issues.push({ code: 'GAP', message: `Hay un hueco entre ${reach} y ${next.min}.` });
    }
    reach = Math.max(reach, next.max);
  }
  if (reach !== GRADE_MAX) {
    issues.push({ code: 'NOT_TO_20', message: `La tabla debe terminar en ${GRADE_MAX}.` });
  }

  return issues;
}

/**
 * Lanza si la tabla no es válida.
 * @throws GradingError `INVALID_SCALE` con la lista de problemas en `issues`.
 */
export function assertLiteralScale(scale: LiteralScale): void {
  const issues = validateLiteralScale(scale);
  if (issues.length > 0) {
    throw new GradingError('INVALID_SCALE', 'Tabla de literales inválida.', issues);
  }
}

/**
 * Literal de un promedio ya redondeado (RN-04). Exige un entero 0..20: se
 * aplica al `rounded` de `calculateAverage`, nunca a un promedio sin redondear.
 * @throws GradingError `INVALID_GRADE` si `rounded` no es entero 0..20,
 *   `INVALID_SCALE` si la tabla no es válida.
 */
export function toLiteral(rounded: number, scale: LiteralScale = DEFAULT_LITERAL_SCALE): string {
  if (!Number.isInteger(rounded) || rounded < GRADE_MIN || rounded > GRADE_MAX) {
    throw new GradingError(
      'INVALID_GRADE',
      `Promedio inválido para literal: ${String(rounded)}. Debe ser un entero entre ${GRADE_MIN} y ${GRADE_MAX}.`,
    );
  }
  assertLiteralScale(scale);
  // Con la tabla validada, todo entero 0..20 cae en exactamente un tramo.
  const band = scale.find((b) => rounded >= b.min && rounded <= b.max) as LiteralBand;
  return band.literal;
}
