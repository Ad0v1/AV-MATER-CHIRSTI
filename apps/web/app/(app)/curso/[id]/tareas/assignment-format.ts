// Formatos y validaciones puras de la pantalla de tareas (Dev 3, fase 3f). Sin React ni red.
import { MIB } from '../_materials/pdf-check';

export { checkPdf, formatSize, MIB } from '../_materials/pdf-check';

export const DEFAULT_MAX_MIB = 20; // RN-08
export const MAX_MIB_CAP = 50; // RN-08
const LIMA_OFFSET = '-05:00'; // Perú no tiene horario de verano

/** Los seis rótulos de RF-38 (docs/04). */
export const DISPLAY_STATUS_LABEL = {
  PENDING: 'Pendiente',
  SUBMITTED: 'Entregada',
  SUBMITTED_LATE: 'Entregada con retraso',
  NOT_SUBMITTED: 'No entregada (NE)',
  GRADED: 'Calificada',
  EXEMPT: 'Exonerada',
} as const;

export type DisplayStatus = keyof typeof DISPLAY_STATUS_LABEL;

export function statusLabel(status: string): string {
  return DISPLAY_STATUS_LABEL[status as DisplayStatus] ?? status;
}

/** Fecha y hora en la zona del colegio (America/Lima). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Atraso informado (RN-06, sin descuento): "2 h 5 min", "3 d 1 h", "40 s". */
export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, seconds)} s`;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

/** Valor de `<input type="datetime-local">` ("2026-11-05T23:59") a ISO con zona de Lima. */
export function localToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00${LIMA_OFFSET}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export type NewAssignmentInput = {
  periodId: string;
  title: string;
  instructions: string;
  dueLocal: string;
  noSubmissionGrade: string;
  maxSizeMiB: string;
  allowLate: boolean;
  /** Escala literal (INICIAL/PRIMARIA): la NE es un literal AD/A/B/C opcional, no un número. */
  literalScale?: boolean;
  /** '' = sin literal de NE (null en la API). Solo se usa con `literalScale`. */
  noSubmissionLiteral?: string;
};

/** Literales de NE que acepta la API (escala AD/A/B/C). */
export const NO_SUBMISSION_LITERALS = ['AD', 'A', 'B', 'C'] as const;
export type NoSubmissionLiteral = (typeof NO_SUBMISSION_LITERALS)[number];

function isLiteralOption(v: unknown): boolean {
  return v === '' || NO_SUBMISSION_LITERALS.includes(v as NoSubmissionLiteral);
}

/** INICIAL y PRIMARIA califican con AD/A/B/C; SECUNDARIA con 0-20. */
export function isLiteralLevel(level: string | null | undefined): boolean {
  return level === 'INICIAL' || level === 'PRIMARIA';
}

/** Decisión del usuario: en INICIAL los niños no entregan PDF (actividad sin entrega). */
export function isNoDeliveryLevel(level: string | null | undefined): boolean {
  return level === 'INICIAL';
}

export type NewAssignmentBody = {
  periodId: string;
  title: string;
  instructions: string;
  dueAt: string;
  noSubmissionGrade: string;
  /** Solo en escala literal; en SECUNDARIA no se envía. */
  noSubmissionLiteral?: NoSubmissionLiteral | null;
  maxSizeBytes: number;
  allowLate: boolean;
};

export type AssignmentField =
  'periodId' | 'title' | 'instructions' | 'dueLocal' | 'noSubmissionGrade' | 'maxSizeMiB';

/** Orden de los campos en el formulario (el foco va al primero con error). */
export const ASSIGNMENT_FIELDS: readonly AssignmentField[] = [
  'periodId',
  'title',
  'instructions',
  'dueLocal',
  'noSubmissionGrade',
  'maxSizeMiB',
];

export type AssignmentValidation =
  | { ok: true; body: NewAssignmentBody }
  | { ok: false; errors: Partial<Record<AssignmentField, string>>; first: AssignmentField };

/** Valida campo por campo el formulario del docente y arma el cuerpo de la API. */
export function validateAssignment(
  input: NewAssignmentInput,
  now: Date = new Date(),
): AssignmentValidation {
  const errors: Partial<Record<AssignmentField, string>> = {};
  const title = input.title.trim();
  const instructions = input.instructions.trim();
  if (!input.periodId) errors.periodId = 'Elige un período abierto.';
  if (title.length < 1) errors.title = 'Escribe el título de la tarea.';
  else if (title.length > 200) errors.title = 'El título admite hasta 200 caracteres.';
  if (instructions.length < 1) errors.instructions = 'Escribe las instrucciones de la tarea.';
  const dueAt = localToIso(input.dueLocal);
  if (!dueAt) errors.dueLocal = 'Indica la fecha y la hora del plazo.';
  else if (Date.parse(dueAt) <= now.getTime()) {
    errors.dueLocal = 'El plazo debe ser una fecha y hora futura.';
  }
  const literal = input.literalScale === true;
  const grade = literal ? '0' : input.noSubmissionGrade.trim().replace(',', '.') || '0';
  if (literal && !isLiteralOption(input.noSubmissionLiteral ?? '')) {
    errors.noSubmissionGrade = 'Elige AD, A, B, C o «Sin calificación».';
  } else if ((!literal && !/^\d{1,2}(\.\d{1,2})?$/.test(grade)) || Number(grade) > 20) {
    errors.noSubmissionGrade =
      'Escribe una nota de 0 a 20, con hasta 2 decimales (por ejemplo, 0 o 10.5).';
  }
  const mib = Number(input.maxSizeMiB.trim() || DEFAULT_MAX_MIB);
  if (!Number.isInteger(mib) || mib < 1 || mib > MAX_MIB_CAP) {
    errors.maxSizeMiB = `Escribe un número entero de 1 a ${MAX_MIB_CAP}.`;
  }
  const first = ASSIGNMENT_FIELDS.find((f) => errors[f] !== undefined);
  if (first || !dueAt) return { ok: false, errors, first: first ?? 'dueLocal' };
  return {
    ok: true,
    body: {
      periodId: input.periodId,
      title,
      instructions,
      dueAt,
      noSubmissionGrade: grade,
      ...(literal
        ? { noSubmissionLiteral: (input.noSubmissionLiteral || null) as NoSubmissionLiteral | null }
        : {}),
      maxSizeBytes: mib * MIB,
      allowLate: input.allowLate,
    },
  };
}

/** Igual que validateAssignment, con un solo mensaje (el del primer campo con error). */
export function buildAssignmentBody(
  input: NewAssignmentInput,
  now: Date = new Date(),
): { ok: true; body: NewAssignmentBody } | { ok: false; message: string } {
  const r = validateAssignment(input, now);
  return r.ok ? r : { ok: false, message: r.errors[r.first] ?? 'Revisa los datos.' };
}

/** RF-37: la tarea recibe entregas si el período está abierto y no venció o admite tardías. */
export function acceptsSubmissions(
  a: { periodIsOpen: boolean; allowLate: boolean; dueAt: string },
  now: Date = new Date(),
): boolean {
  return a.periodIsOpen && (a.allowLate || Date.parse(a.dueAt) > now.getTime());
}

// ---------------------------------------------------------------- Edición (RF-29/30, RN-10)

/** ISO (UTC) a valor de `<input type="datetime-local">` en hora de Lima ("2026-11-05T23:59"). */
export function isoToLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  // Lima es UTC-5 fijo: se resta el desfase y se toma la parte local de la cadena ISO.
  return new Date(ms - 5 * 3_600_000).toISOString().slice(0, 16);
}

/** Valores iniciales del formulario de edición a partir de la tarea publicada. */
export function assignmentToInput(
  a: {
    periodId: string;
    title: string;
    instructions: string;
    dueAt: string;
    noSubmissionGrade: string;
    noSubmissionLiteral?: string | null;
    maxSizeBytes: number;
    allowLate: boolean;
  },
  literalScale = false,
): NewAssignmentInput {
  return {
    periodId: a.periodId,
    title: a.title,
    instructions: a.instructions,
    dueLocal: isoToLocal(a.dueAt),
    noSubmissionGrade: String(Number(a.noSubmissionGrade)),
    maxSizeMiB: String(Math.max(1, Math.round(a.maxSizeBytes / MIB))),
    allowLate: a.allowLate,
    ...(literalScale
      ? { literalScale: true, noSubmissionLiteral: a.noSubmissionLiteral ?? '' }
      : {}),
  };
}

export type AssignmentPatch = Partial<Omit<NewAssignmentBody, 'periodId'>>;

/**
 * Valida la edición y arma el PATCH solo con los campos cambiados (sin período: no se edita).
 * Si el plazo no cambió, no se exige que sea futuro (una tarea vencida puede corregir su título).
 */
export function buildAssignmentPatch(
  original: NewAssignmentInput,
  input: NewAssignmentInput,
  now: Date = new Date(),
):
  | { ok: true; patch: AssignmentPatch; changed: boolean }
  | { ok: false; errors: Partial<Record<AssignmentField, string>>; first: AssignmentField } {
  const same = input.dueLocal === original.dueLocal;
  const r = validateAssignment({ ...input, periodId: original.periodId }, same ? new Date(0) : now);
  if (!r.ok) return r;
  const before = validateAssignment(original, new Date(0));
  const patch: AssignmentPatch = {};
  const b = r.body;
  const o = before.ok ? before.body : null;
  if (!o || b.title !== o.title) patch.title = b.title;
  if (!o || b.instructions !== o.instructions) patch.instructions = b.instructions;
  if (!same) patch.dueAt = b.dueAt;
  if (input.literalScale) {
    if ((b.noSubmissionLiteral ?? null) !== (original.noSubmissionLiteral || null)) {
      patch.noSubmissionLiteral = b.noSubmissionLiteral ?? null;
    }
  } else if (!o || Number(b.noSubmissionGrade) !== Number(o.noSubmissionGrade)) {
    patch.noSubmissionGrade = b.noSubmissionGrade;
  }
  if (!o || b.maxSizeBytes !== o.maxSizeBytes) patch.maxSizeBytes = b.maxSizeBytes;
  if (b.allowLate !== original.allowLate) patch.allowLate = b.allowLate;
  return { ok: true, patch, changed: Object.keys(patch).length > 0 };
}

/** Solo URLs http(s) firmadas: nunca javascript: ni data:. */
export function isSafeHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

/** Las server actions reciben datos del cliente: comprueba la forma antes de validar. */
export function isAssignmentInput(v: unknown): v is NewAssignmentInput {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const strings = [
    'periodId',
    'title',
    'instructions',
    'dueLocal',
    'noSubmissionGrade',
    'maxSizeMiB',
  ];
  return (
    strings.every((k) => typeof o[k] === 'string') &&
    typeof o.allowLate === 'boolean' &&
    (o.literalScale === undefined || typeof o.literalScale === 'boolean') &&
    (o.noSubmissionLiteral === undefined || isLiteralOption(o.noSubmissionLiteral))
  );
}
