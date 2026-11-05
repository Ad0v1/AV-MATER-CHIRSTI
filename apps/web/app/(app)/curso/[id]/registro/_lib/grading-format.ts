// Formatos y validaciones puras de calificaciones (Dev 4, fase 4c). Sin React ni red.
// Las reglas reales las decide la API (motor de @aula/shared); aquí solo se adelantan los
// errores obvios para no hacer un viaje en vano y se traducen los códigos 422.
import type { AverageSummary, EffectiveGrade, GradeInput, GradeState } from './types';

export const COMMENT_MAX = 2000;
export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Escala por defecto (RN-04); un literal desconocido se muestra tal cual. */
const LITERAL_LABEL: Record<string, string> = {
  AD: 'logro destacado',
  A: 'logro esperado',
  B: 'en proceso',
  C: 'en inicio',
};

export function literalLabel(literal: string): string {
  const name = LITERAL_LABEL[literal];
  return name ? `${literal} (${name})` : literal;
}

/** "15 · A (logro esperado)" o "Sin notas" (D-026: nunca 0). */
export function averageText(average: AverageSummary): string {
  if (average.status === 'NO_GRADES') return 'Sin notas';
  return `${average.rounded} · ${literalLabel(average.literal)}`;
}

/** Texto corto de una celda, siempre con texto (no solo color). */
export function cellText(grade: EffectiveGrade): string {
  switch (grade.state) {
    case 'GRADED':
      return grade.value ?? '';
    case 'NE':
      return `NE ${grade.value ?? ''}`.trim();
    case 'EXEMPT':
      return 'Exonerado';
    default:
      return '—';
  }
}

export const STATE_LABEL: Record<GradeState, string> = {
  GRADED: 'Nota',
  NE: 'No entregó (NE)',
  EXEMPT: 'Exonerar',
};

/** Mensajes de los 422 de PUT /grades por su code (la API ya los manda en español). */
const ERROR_BY_CODE: Record<string, string> = {
  NO_SUBMISSION: 'Solo se pone nota a una tarea entregada. Si no entregó, registra NE.',
  HAS_SUBMISSION: 'El estudiante entregó la tarea: califícala con nota en lugar de NE.',
  NOT_OVERDUE: 'La tarea todavía no vence: aún no se puede registrar NE.',
  ENROLLMENT_OUT_OF_SECTION: 'El estudiante no pertenece a la sección de esta tarea.',
  ENROLLMENT_NOT_ELIGIBLE:
    'El estudiante no estaba matriculado en la sección cuando venció la tarea.',
};

export function gradeErrorMessage(code: string | undefined): string | undefined {
  return code ? ERROR_BY_CODE[code] : undefined;
}

export type GradeFormFields = {
  state: GradeState;
  value: string;
  comment: string;
  exemptionReason: string;
};

export type GradeFormErrors = Partial<
  Record<'state' | 'value' | 'comment' | 'exemptionReason', string>
>;

const GRADE_TEXT = /^\d{1,2}([.,]\d{1,2})?$/;

/** Nota del formulario: acepta coma decimal; 0..20 con hasta 2 decimales (RN-01). */
export function parseGradeText(text: string): string | null {
  const t = text.trim();
  if (!GRADE_TEXT.test(t)) return null;
  const normalized = t.replace(',', '.');
  const n = Number(normalized);
  return n >= 0 && n <= 20 ? normalized : null;
}

/**
 * Valida el formulario y arma el cuerpo del PUT. NE sin nota usa la de la tarea (RN-05);
 * EXEMPT exige motivo de 10 a 500 caracteres (RF-46).
 */
export function buildGradeInput(
  fields: GradeFormFields,
): { ok: true; body: GradeInput } | { ok: false; errors: GradeFormErrors } {
  const errors: GradeFormErrors = {};
  const comment = fields.comment.trim();
  if (comment.length > COMMENT_MAX) {
    errors.comment = `El comentario admite hasta ${COMMENT_MAX} caracteres.`;
  }
  const withComment = comment ? { comment } : {};

  if (fields.state === 'EXEMPT') {
    const reason = fields.exemptionReason.trim();
    if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
      errors.exemptionReason = `Escribe un motivo de ${REASON_MIN} a ${REASON_MAX} caracteres.`;
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    return { ok: true, body: { state: 'EXEMPT', exemptionReason: reason, ...withComment } };
  }

  const raw = fields.value.trim();
  let value: string | null = null;
  if (raw === '') {
    if (fields.state === 'GRADED') errors.value = 'Escribe la nota (0 a 20).';
  } else {
    value = parseGradeText(raw);
    if (value === null) errors.value = 'La nota debe estar entre 0 y 20, con hasta 2 decimales.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (fields.state === 'GRADED') {
    return { ok: true, body: { state: 'GRADED', value: value!, ...withComment } };
  }
  return { ok: true, body: { state: 'NE', ...(value ? { value } : {}), ...withComment } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
