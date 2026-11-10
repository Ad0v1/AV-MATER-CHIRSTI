// Validación local de los formularios de estructura (RF-09..14, RF-17). Lógica pura: la usan
// las Server Actions y los formularios cliente, y se prueba con Vitest. La API sigue siendo la
// autoridad: estas reglas solo evitan viajes inútiles y dan mensajes junto al campo.
// Límites copiados de apps/api/src/modules/academic/academic.dto.ts (docs/03).
// Lo común (motivos, uuid, booleanos) vive en admin/_shared/lib/validation.ts.
export {
  REASON_NOTICE,
  isStrictBoolean,
  isUuid,
  reasonCounter,
  reasonLength,
  validateReason,
  type ReasonLimits,
} from '../../_shared/lib/validation';

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const PERIOD_COUNT = 4;
export const COURSE_NAME_MAX = 120;
export const SECTION_CODE_PATTERN = /^[A-Z0-9]{1,8}$/;
/** Grados de SECUNDARIA (compatibilidad). Para otros niveles usa gradesForLevel de @aula/shared. */
export const GRADE_LEVELS = [1, 2, 3, 4, 5] as const;

/** Límites de los motivos (texto libre que va a la bitácora). */
export const REASON_LIMITS = {
  /** Cierre de período: opcional, 1..500 si se escribe. */
  closePeriod: { required: false, min: 1, max: 500 },
  /** Reapertura de período (RF-11): obligatorio, 10..500. */
  reopenPeriod: { required: true, min: 10, max: 500 },
} as const;

/** true si `iso` es un día real con formato YYYY-MM-DD. */
export function isDateOnly(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Año como entero entre 2000 y 2100, o null. */
export function parseYear(raw: string): number | null {
  if (!/^\d{4}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

/** Código de sección en mayúsculas, o null si no cumple `[A-Z0-9]{1,8}`. */
export function normalizeSectionCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return SECTION_CODE_PATTERN.test(code) ? code : null;
}

/** Nombre de curso sin espacios en los extremos, o null si queda vacío o pasa de 120. */
export function normalizeCourseName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= COURSE_NAME_MAX ? name : null;
}

export type PeriodDraft = { sequence: number; startDate: string; endDate: string };

export const PERIOD_LABELS: Record<number, string> = {
  1: 'I Bimestre',
  2: 'II Bimestre',
  3: 'III Trimestre',
  4: 'IV Trimestre',
};

/** Fechas propuestas para un año nuevo (las del seed y D-002); el administrador las ajusta. */
export function defaultPeriodDates(year: number): PeriodDraft[] {
  return [
    { sequence: 1, startDate: `${year}-03-01`, endDate: `${year}-04-30` },
    { sequence: 2, startDate: `${year}-05-01`, endDate: `${year}-06-30` },
    { sequence: 3, startDate: `${year}-07-01`, endDate: `${year}-09-30` },
    { sequence: 4, startDate: `${year}-10-01`, endDate: `${year}-12-31` },
  ];
}

/**
 * Mismas reglas que `validatePeriodDates` de la API: día válido, fin >= inicio, dentro del año
 * y sin solaparse con el anterior. Devuelve errores por nombre de campo del formulario
 * (`p<secuencia>_start` / `p<secuencia>_end`).
 */
export function validatePeriodDrafts(year: number, periods: PeriodDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const sorted = [...periods].sort((a, b) => a.sequence - b.sequence);
  sorted.forEach((p, i) => {
    const start = `p${p.sequence}_start`;
    const end = `p${p.sequence}_end`;
    if (!isDateOnly(p.startDate)) errors[start] = 'Ingresa una fecha válida.';
    if (!isDateOnly(p.endDate)) errors[end] = 'Ingresa una fecha válida.';
    if (errors[start] || errors[end]) return;
    if (p.startDate < `${year}-01-01` || p.startDate > `${year}-12-31`) {
      errors[start] = `Debe estar dentro del año ${year}.`;
    }
    if (p.endDate < `${year}-01-01` || p.endDate > `${year}-12-31`) {
      errors[end] = `Debe estar dentro del año ${year}.`;
    }
    if (!errors[end] && p.endDate < p.startDate) {
      errors[end] = 'El fin no puede ser anterior al inicio.';
    }
    const prev = sorted[i - 1];
    if (!errors[start] && prev && isDateOnly(prev.endDate) && p.startDate <= prev.endDate) {
      errors[start] = 'Se solapa con el período anterior.';
    }
  });
  return errors;
}

/**
 * Nombre legible del `path` de un detalle de error de la API:
 * - `periods.<secuencia>` (reglas de fechas del servidor) → "II Bimestre";
 * - `periods.<índice>.<campo>` (validación Zod) → "II Bimestre".
 */
export function periodPathLabel(path: string): string | undefined {
  const parts = path.split('.');
  if (parts[0] !== 'periods' || parts.length < 2) return undefined;
  const n = Number(parts[1]);
  if (!Number.isInteger(n)) return undefined;
  const sequence = parts.length === 2 ? n : n + 1;
  return PERIOD_LABELS[sequence];
}
