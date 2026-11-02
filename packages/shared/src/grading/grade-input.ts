import type { GradeState } from './average';
import { formatGrade, isValidGrade, type GradeInput } from './grade-value';

/** Largo máximo del comentario del docente (RF-42). */
export const GRADE_COMMENT_MAX = 2000;
/** Largo mínimo del motivo de exoneración (RF-46). */
export const EXEMPTION_REASON_MIN = 10;
/** Largo máximo del motivo de exoneración (RF-46, `VarChar(500)`). */
export const EXEMPTION_REASON_MAX = 500;

/**
 * Cuerpo normalizado de `PUT /grades/:assignmentId/:enrollmentId`.
 * - `GRADED`: nota obligatoria.
 * - `NE`: nota opcional; `null` = la API usa la nota NE de la tarea (RN-05).
 * - `EXEMPT`: sin nota y con motivo (RN-07).
 * Nota con 2 decimales (`"05"` → `"5.00"`, A4); comentario vacío → `null`.
 */
export type NormalizedGradeInput =
  | { readonly state: 'GRADED'; readonly value: string; readonly comment: string | null }
  | { readonly state: 'NE'; readonly value: string | null; readonly comment: string | null }
  | {
      readonly state: 'EXEMPT';
      readonly exemptionReason: string;
      readonly comment: string | null;
    };

/** Problema de validación, con la ruta del campo (como en Zod). */
export interface GradeInputIssue {
  readonly path: string;
  readonly message: string;
}

export type GradeInputResult =
  | { readonly ok: true; readonly data: NormalizedGradeInput }
  | { readonly ok: false; readonly issues: readonly GradeInputIssue[] };

const STATES: readonly GradeState[] = ['GRADED', 'NE', 'EXEMPT'];

/**
 * Valida y normaliza el cuerpo de una calificación (RF-41, RF-42, RF-45,
 * RF-46, A4). Discriminado por `state`. Ignora campos desconocidos, como Zod
 * por defecto. No lanza: devuelve `issues`. La API lo envuelve en su esquema
 * Zod (`packages/shared` no depende de Zod).
 */
export function normalizeGradeInput(body: unknown): GradeInputResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('', 'El cuerpo debe ser un objeto.');
  }
  const raw = body as Record<string, unknown>;
  const issues: GradeInputIssue[] = [];

  const state = raw.state;
  if (!STATES.includes(state as GradeState)) {
    return fail('state', 'state debe ser GRADED, NE o EXEMPT.');
  }

  const comment = readComment(raw.comment, issues);

  if (state === 'EXEMPT') {
    if (raw.value !== undefined && raw.value !== null) {
      issues.push({ path: 'value', message: 'Una exoneración no lleva nota.' });
    }
    const reason = typeof raw.exemptionReason === 'string' ? raw.exemptionReason.trim() : null;
    if (reason === null) {
      issues.push({ path: 'exemptionReason', message: 'El motivo de exoneración es obligatorio.' });
    } else if (reason.length < EXEMPTION_REASON_MIN || reason.length > EXEMPTION_REASON_MAX) {
      issues.push({
        path: 'exemptionReason',
        message: `El motivo debe tener entre ${EXEMPTION_REASON_MIN} y ${EXEMPTION_REASON_MAX} caracteres.`,
      });
    }
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, data: { state, exemptionReason: reason as string, comment } };
  }

  if (raw.exemptionReason !== undefined && raw.exemptionReason !== null) {
    issues.push({ path: 'exemptionReason', message: 'Solo una exoneración lleva motivo.' });
  }

  let value: string | null = null;
  if (raw.value === undefined || raw.value === null) {
    if (state === 'GRADED') issues.push({ path: 'value', message: 'La nota es obligatoria.' });
  } else if (isValidGrade(raw.value)) {
    value = formatGrade(raw.value as GradeInput);
  } else {
    issues.push({
      path: 'value',
      message: 'La nota debe estar entre 0 y 20 con hasta 2 decimales.',
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  if (state === 'GRADED') return { ok: true, data: { state, value: value as string, comment } };
  return { ok: true, data: { state: 'NE', value, comment } };
}

function readComment(input: unknown, issues: GradeInputIssue[]): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') {
    issues.push({ path: 'comment', message: 'El comentario debe ser texto.' });
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length > GRADE_COMMENT_MAX) {
    issues.push({
      path: 'comment',
      message: `El comentario admite hasta ${GRADE_COMMENT_MAX} caracteres.`,
    });
    return null;
  }
  return trimmed === '' ? null : trimmed;
}

function fail(path: string, message: string): GradeInputResult {
  return { ok: false, issues: [{ path, message }] };
}
