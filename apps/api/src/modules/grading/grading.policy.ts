import {
  formatGrade,
  isNeEligible,
  isOverdue,
  resolveNoSubmissionGrade,
  type GradeEntry,
  type NormalizedGradeInput,
} from '@aula/shared';

// Reglas puras de la API de calificaciones (A1, U2, U3), sin BD. Probadas en grading.policy.spec.ts.

export type GradeStateValue = 'GRADED' | 'NE' | 'EXEMPT';
export type GradeSourceValue = 'MANUAL' | 'AUTO';

/** Fila de Grade tal como la lee la API (value como texto "13.50" o null). */
export type GradeRow = {
  state: GradeStateValue;
  value: string | null;
  comment: string | null;
  exemptionReason: string | null;
  source: GradeSourceValue;
};

/** Lo único que va a la bitácora (U3): nunca comment ni exemptionReason. */
export type GradeAuditState = { state: GradeStateValue; value: string | null; source: string };

export const GRADE_ERRORS = {
  NO_SUBMISSION: 'Solo se califica con nota una tarea entregada',
  HAS_SUBMISSION: 'El estudiante entregó la tarea: califícala con nota',
  NOT_OVERDUE: 'La tarea aún no vence: no se puede registrar NE',
  ENROLLMENT_OUT_OF_SECTION: 'La matrícula no es de la sección de la tarea',
  ENROLLMENT_NOT_ELIGIBLE: 'La matrícula no estaba vigente al vencer la tarea',
} as const;
export type GradeErrorCode = keyof typeof GRADE_ERRORS;

/** Decimal de Prisma (o texto/número) a "13.50"; null se mantiene. */
export const decimalText = (value: { toFixed(d: number): string } | null): string | null =>
  value === null ? null : value.toFixed(2);

/** Fila de Grade → entrada del motor. */
export function toGradeEntry(row: { state: GradeStateValue; value: string | null }): GradeEntry {
  if (row.state === 'EXEMPT') return { state: 'EXEMPT' };
  return { state: row.state, value: row.value ?? '0' };
}

export type ManualGradeContext = {
  input: NormalizedGradeInput;
  hasSubmission: boolean;
  dueAt: Date;
  now: Date;
  /** Nota NE de la tarea ("0.00"). */
  noSubmissionGrade: string;
  enrollment: { isCurrent: boolean; effectiveFrom: Date; effectiveTo: Date | null };
};

export type ManualGradeDecision =
  { ok: true; row: GradeRow } | { ok: false; code: GradeErrorCode; message: string };

const reject = (code: GradeErrorCode): ManualGradeDecision => ({
  ok: false,
  code,
  message: GRADE_ERRORS[code],
});

/**
 * A1: GRADED exige entrega; NE manual exige que no haya entrega, que la tarea haya vencido y
 * que la matrícula estuviera vigente al vencer (sin value usa la nota NE de la tarea, RN-05);
 * EXEMPT exige una matrícula vigente o elegible. Toda escritura manual queda con source MANUAL.
 */
export function decideManualGrade(ctx: ManualGradeContext): ManualGradeDecision {
  const { input, enrollment } = ctx;
  const eligible = isNeEligible(enrollment, ctx.dueAt);
  switch (input.state) {
    case 'GRADED':
      if (!ctx.hasSubmission) return reject('NO_SUBMISSION');
      return {
        ok: true,
        row: {
          state: 'GRADED',
          value: input.value,
          comment: input.comment,
          exemptionReason: null,
          source: 'MANUAL',
        },
      };
    case 'NE':
      if (ctx.hasSubmission) return reject('HAS_SUBMISSION');
      if (!isOverdue(ctx.dueAt, ctx.now)) return reject('NOT_OVERDUE');
      if (!eligible) return reject('ENROLLMENT_NOT_ELIGIBLE');
      return {
        ok: true,
        row: {
          state: 'NE',
          value: input.value ?? resolveNoSubmissionGrade(ctx.noSubmissionGrade),
          comment: input.comment,
          exemptionReason: null,
          source: 'MANUAL',
        },
      };
    case 'EXEMPT':
      if (!enrollment.isCurrent && !eligible) return reject('ENROLLMENT_NOT_ELIGIBLE');
      return {
        ok: true,
        row: {
          state: 'EXEMPT',
          value: null,
          comment: input.comment,
          exemptionReason: input.exemptionReason,
          source: 'MANUAL',
        },
      };
  }
}

const FIELDS = ['state', 'value', 'comment', 'exemptionReason', 'source'] as const;

/** Nombres de los campos que cambian (sin sus valores). Todos si no había fila. */
export function changedFields(before: GradeRow | null, after: GradeRow): string[] {
  if (before === null) return FIELDS.filter((f) => after[f] !== null);
  return FIELDS.filter((f) => normalized(before, f) !== normalized(after, f));
}

const normalized = (row: GradeRow, field: (typeof FIELDS)[number]): string | null => {
  const v = row[field];
  if (field === 'value' && v !== null) return formatGrade(v);
  return v;
};

export const auditState = (row: GradeRow): GradeAuditState => ({
  state: row.state,
  value: row.value,
  source: row.source,
});
