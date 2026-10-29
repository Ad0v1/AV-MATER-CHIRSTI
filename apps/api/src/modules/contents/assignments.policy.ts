// Reglas puras de las tareas (RF-28/29, RN-05, RN-08), sin BD. Probadas en assignments.policy.spec.ts.

/** 1 MiB en bytes (decisión del usuario 29/10/2026: los MB de la ERS se cuentan en MiB). */
export const MIB = 1_048_576;
/** RN-08: tamaño máximo por defecto de una entrega, 20 MiB. */
export const DEFAULT_MAX_SIZE_BYTES = 20 * MIB; // 20971520
/** RN-08: tope configurable por tarea, 50 MiB. */
export const MAX_SIZE_CAP_BYTES = 50 * MIB; // 52428800
/** RN-05: nota NE por defecto. */
export const DEFAULT_NO_SUBMISSION_GRADE = '0.00';
export const MIN_GRADE = 0;
export const MAX_GRADE = 20;

export const TITLE_MAX = 200;
export const INSTRUCTIONS_MAX = 10_000;

const GRADE_TEXT = /^\d{1,2}(\.\d{1,2})?$/;

/**
 * RN-05: nota NE entre 0 y 20 con hasta 2 decimales. Acepta número o texto ("12.5") y la
 * devuelve como texto con 2 decimales ("12.50"), igual que el Decimal(4,2) de la BD y el
 * contrato de Dev 4. null si no es válida.
 */
export function normalizeGrade(value: number | string): string | null {
  let cents: number;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    cents = Math.round(value * 100);
    if (Math.abs(cents - value * 100) > 1e-6) return null; // más de 2 decimales
  } else {
    if (!GRADE_TEXT.test(value)) return null;
    cents = Math.round(Number(value) * 100);
  }
  if (cents < MIN_GRADE * 100 || cents > MAX_GRADE * 100) return null;
  return (cents / 100).toFixed(2);
}

/** RN-08: tamaño máximo válido (entero entre 1 byte y 50 MiB). */
export const isValidMaxSize = (bytes: number): boolean =>
  Number.isInteger(bytes) && bytes >= 1 && bytes <= MAX_SIZE_CAP_BYTES;

/** El plazo debe quedar en el futuro al crear la tarea o al cambiarlo. */
export const isDueAtAcceptable = (dueAt: Date, now: Date): boolean =>
  dueAt.getTime() > now.getTime();

/** Campos de la tarea que se comparan para editar, bitácora y eventos. */
export type AssignmentFields = {
  title: string;
  instructions: string;
  dueAt: Date;
  maxSizeBytes: number;
  noSubmissionGrade: string;
  allowLate: boolean;
  attachmentFileId: string | null;
};

/** Orden fijo de los campos en changedFields (no depende del orden del cuerpo recibido). */
const FIELD_ORDER: ReadonlyArray<keyof AssignmentFields> = [
  'title',
  'instructions',
  'dueAt',
  'maxSizeBytes',
  'noSubmissionGrade',
  'allowLate',
  'attachmentFileId',
];

/** Textos libres: nunca van a la bitácora ni a los eventos (pueden tener datos personales). */
const FREE_TEXT_FIELDS = new Set<keyof AssignmentFields>(['title', 'instructions']);

const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : Object.is(a, b);

const auditValue = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export type AssignmentChange = {
  /** Nombres de todos los campos que cambian (incluye title/instructions, sin su valor). */
  changedFields: Array<keyof AssignmentFields>;
  /** Valores anteriores y nuevos solo de los campos que no son texto libre. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/** Compara la tarea actual con la edición pedida (las claves undefined no cuentan). */
export function diffAssignment(
  current: AssignmentFields,
  patch: Partial<AssignmentFields>,
): AssignmentChange {
  const change: AssignmentChange = { changedFields: [], before: {}, after: {} };
  for (const key of FIELD_ORDER) {
    const next = patch[key];
    if (next === undefined || same(current[key], next)) continue;
    change.changedFields.push(key);
    if (FREE_TEXT_FIELDS.has(key)) continue;
    change.before[key] = auditValue(current[key]);
    change.after[key] = auditValue(next);
  }
  return change;
}

/** Instantánea para la bitácora al crear: ids y configuración, sin título ni instrucciones. */
export function auditSnapshot(
  fields: AssignmentFields & { courseSectionId: string; periodId: string },
): Record<string, unknown> {
  return {
    courseSectionId: fields.courseSectionId,
    periodId: fields.periodId,
    dueAt: fields.dueAt.toISOString(),
    maxSizeBytes: fields.maxSizeBytes,
    noSubmissionGrade: fields.noSubmissionGrade,
    allowLate: fields.allowLate,
    attachmentFileId: fields.attachmentFileId,
  };
}
