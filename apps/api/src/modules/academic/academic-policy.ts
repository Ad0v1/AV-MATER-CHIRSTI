// Reglas puras del módulo académico (sin BD), probadas en academic-policy.spec.ts.
import type { AcademicPeriodKind } from '../../generated/prisma/enums.js';

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const PERIOD_COUNT = 4;

/** Tipo de cada período según su secuencia (D-002): dos bimestres y dos trimestres. */
const PERIOD_KINDS: Record<number, AcademicPeriodKind> = {
  1: 'FIRST_BIMESTER',
  2: 'SECOND_BIMESTER',
  3: 'THIRD_TRIMESTER',
  4: 'FOURTH_TRIMESTER',
};

export const PERIOD_LABELS: Record<AcademicPeriodKind, string> = {
  FIRST_BIMESTER: 'I Bimestre',
  SECOND_BIMESTER: 'II Bimestre',
  THIRD_TRIMESTER: 'III Trimestre',
  FOURTH_TRIMESTER: 'IV Trimestre',
};

export function periodKindFor(sequence: number): AcademicPeriodKind {
  const kind = PERIOD_KINDS[sequence];
  if (!kind) throw new RangeError(`Secuencia de período inválida: ${sequence}`);
  return kind;
}

export type YearState = { year: number; isActive: boolean | null; closedAt: Date | null };

/**
 * Solo lectura (D-030 PROPUESTA): año cerrado, o año no activo anterior al activo.
 * Un año futuro no cerrado se puede preparar.
 */
export function isYearReadOnly(year: YearState, activeYear: { year: number } | null): boolean {
  if (year.closedAt !== null) return true;
  return year.isActive !== true && activeYear !== null && year.year < activeYear.year;
}

export type PeriodDates = { sequence: number; startDate: string; endDate: string };
export type Issue = { path: string; message: string };

const isValidDay = (iso: string): boolean => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

/**
 * Fechas de los períodos de un año ('YYYY-MM-DD', comparables como texto):
 * inicio <= fin, dentro del año calendario y sin solapes (se permiten huecos).
 * Devuelve la lista de problemas; vacía si todo está bien.
 */
export function validatePeriodDates(year: number, periods: PeriodDates[]): Issue[] {
  const issues: Issue[] = [];
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const sorted = [...periods].sort((a, b) => a.sequence - b.sequence);
  sorted.forEach((p, i) => {
    const path = `periods.${p.sequence}`;
    if (!isValidDay(p.startDate) || !isValidDay(p.endDate)) {
      issues.push({ path, message: 'La fecha no es válida' });
      return;
    }
    if (p.endDate < p.startDate) {
      issues.push({ path, message: 'La fecha de fin es anterior a la de inicio' });
    }
    if (p.startDate < first || p.endDate > last) {
      issues.push({ path, message: `Las fechas deben estar dentro del año ${year}` });
    }
    const prev = sorted[i - 1];
    if (prev && p.startDate <= prev.endDate) {
      issues.push({ path, message: 'El período se solapa con el anterior' });
    }
  });
  return issues;
}

/** Cambia el año de una fecha 'YYYY-MM-DD'; null si el día no existe (29 de febrero). */
export function shiftDateToYear(iso: string, year: number): string | null {
  const shifted = `${String(year).padStart(4, '0')}${iso.slice(4)}`;
  return isValidDay(shifted) ? shifted : null;
}

/** Fecha de hoy en America/Lima como 'YYYY-MM-DD'. */
export function todayInLima(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Período en curso según `today`, o null si cae en un hueco o fuera del año. */
export function currentPeriodOf<T extends { startDate: string; endDate: string }>(
  periods: T[],
  today: string,
): T | null {
  return periods.find((p) => p.startDate <= today && today <= p.endDate) ?? null;
}
