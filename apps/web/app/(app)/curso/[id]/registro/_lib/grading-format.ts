// Formatos y validaciones puras de calificaciones (Dev 4, fase 4c). Sin React ni red.
// Las reglas reales las decide la API (motor de @aula/shared); aquí solo se adelantan los
// errores obvios para no hacer un viaje en vano y se traducen los códigos 422.
import type {
  AverageSummary,
  EducationLevel,
  EffectiveGrade,
  GradeInput,
  GradeLiteral,
  GradeState,
  GradingScale,
} from './types';

export const GRADE_LITERALS: readonly GradeLiteral[] = ['AD', 'A', 'B', 'C'];

const LEVEL_LABEL: Record<EducationLevel, string> = {
  INICIAL: 'Inicial',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
};

/** "5 años C · Inicial", "4.° C · Primaria", "3.° A · Secundaria". */
export function sectionText(s: {
  level?: EducationLevel;
  gradeLevel: number;
  code: string;
}): string {
  const level = s.level ?? 'SECUNDARIA';
  const grade = level === 'INICIAL' ? `${s.gradeLevel} años` : `${s.gradeLevel}.°`;
  return `${grade} ${s.code} · ${LEVEL_LABEL[level]}`;
}

export const isLiteral = (scale: GradingScale | undefined): boolean => scale === 'LITERAL_ADABC';

export function isGradeLiteral(v: unknown): v is GradeLiteral {
  return typeof v === 'string' && (GRADE_LITERALS as readonly string[]).includes(v);
}

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

/** "15 · A (logro esperado)" o "Sin notas" (D-026: nunca 0). Escala literal: sin promedio. */
export function averageText(average: AverageSummary): string {
  if (average.status === 'NO_GRADES') return 'Sin notas';
  if (average.status === 'LITERAL_SCALE') return 'Sin promedio (escala literal)';
  return `${average.rounded} · ${literalLabel(average.literal)}`;
}

/** Texto corto de una celda, siempre con texto (no solo color). */
export function cellText(grade: EffectiveGrade): string {
  switch (grade.state) {
    case 'GRADED':
      return grade.literal ?? grade.value ?? '';
    case 'NE':
      return `NE ${grade.literal ?? grade.value ?? ''}`.trim();
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

/** Etiquetas del tipo de registro según el nivel: en INICIAL no hay entregas, así que la NE
 *  se presenta como "Sin registro de logro" (decisión 3 del usuario, 09/11/2026). */
export function stateLabel(state: GradeState, noDelivery = false): string {
  return noDelivery && state === 'NE' ? 'Sin registro de logro' : STATE_LABEL[state];
}

/** Mensajes de los 422 de PUT /grades por su code (la API ya los manda en español). */
const ERROR_BY_CODE: Record<string, string> = {
  NO_SUBMISSION: 'Solo se pone nota a una tarea entregada. Si no entregó, registra NE.',
  HAS_SUBMISSION: 'El estudiante entregó la tarea: califícala con nota en lugar de NE.',
  NOT_OVERDUE: 'La tarea todavía no vence: aún no se puede registrar NE.',
  ENROLLMENT_OUT_OF_SECTION: 'El estudiante no pertenece a la sección de esta tarea.',
  ENROLLMENT_NOT_ELIGIBLE:
    'El estudiante no estaba matriculado en la sección cuando venció la tarea.',
  NE_LITERAL_REQUIRED: 'La tarea no tiene literal de NE: elige AD, A, B o C.',
};

export function gradeErrorMessage(code: string | undefined): string | undefined {
  return code ? ERROR_BY_CODE[code] : undefined;
}

export type GradeFormFields = {
  state: GradeState;
  value: string;
  /** Escala literal: AD/A/B/C elegido ('' = ninguno). */
  literal?: GradeLiteral | '';
  /** Escala del nivel; por defecto NUMERIC_0_20. */
  scale?: GradingScale;
  comment: string;
  exemptionReason: string;
};

export type GradeFormErrors = Partial<
  Record<'state' | 'value' | 'literal' | 'comment' | 'exemptionReason', string>
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

  if (isLiteral(fields.scale)) {
    const literal = fields.literal ?? '';
    if (literal === '' && fields.state === 'GRADED') errors.literal = 'Elige AD, A, B o C.';
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    if (fields.state === 'GRADED') {
      return {
        ok: true,
        body: { state: 'GRADED', literal: literal as GradeLiteral, ...withComment },
      };
    }
    return { ok: true, body: { state: 'NE', ...(literal ? { literal } : {}), ...withComment } };
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
