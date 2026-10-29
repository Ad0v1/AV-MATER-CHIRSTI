import { z } from 'zod';
import {
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_NO_SUBMISSION_GRADE,
  INSTRUCTIONS_MAX,
  MAX_SIZE_CAP_BYTES,
  normalizeGrade,
  TITLE_MAX,
} from './assignments.policy.js';

// Entradas de las tareas (RF-28/29). Estrictas: un campo de más es 400 (QA-004 incluido).

export const idSchema = z.uuid();

const title = z.string().trim().min(1).max(TITLE_MAX);
const instructions = z.string().trim().min(1).max(INSTRUCTIONS_MAX);
// ISO-8601 con zona explícita (docs/03): "2026-10-20T23:59:00-05:00" o con Z.
const dueAt = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
// RN-08: entero entre 1 byte y 50 MiB.
const maxSizeBytes = z
  .number()
  .int()
  .min(1)
  .max(MAX_SIZE_CAP_BYTES, { message: 'El tamaño máximo no puede superar 50 MB (52428800 bytes)' });
// RN-05: 0..20 con hasta 2 decimales; se devuelve como texto "12.50".
const noSubmissionGrade = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const grade = normalizeGrade(value);
  if (grade === null) {
    ctx.addIssue({ code: 'custom', message: 'La nota NE va de 0 a 20 con hasta 2 decimales' });
    return z.NEVER;
  }
  return grade;
});

export const createAssignmentSchema = z.strictObject({
  periodId: idSchema,
  title,
  instructions,
  dueAt,
  maxSizeBytes: maxSizeBytes.default(DEFAULT_MAX_SIZE_BYTES),
  noSubmissionGrade: noSubmissionGrade.default(DEFAULT_NO_SUBMISSION_GRADE),
  allowLate: z.boolean().default(false),
  attachmentFileId: idSchema.nullable().default(null),
});
export type CreateAssignmentDto = z.output<typeof createAssignmentSchema>;

// El período no se cambia al editar: si la tarea va en otro período, se crea otra.
export const updateAssignmentSchema = z
  .strictObject({
    title: title.optional(),
    instructions: instructions.optional(),
    dueAt: dueAt.optional(),
    maxSizeBytes: maxSizeBytes.optional(),
    noSubmissionGrade: noSubmissionGrade.optional(),
    allowLate: z.boolean().optional(),
    attachmentFileId: idSchema.nullable().optional(), // null quita el adjunto
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Debes enviar al menos un campo',
  });
export type UpdateAssignmentDto = z.output<typeof updateAssignmentSchema>;

export const listAssignmentsQuerySchema = z.strictObject({ periodId: idSchema.optional() });
export type ListAssignmentsQuery = z.output<typeof listAssignmentsQuerySchema>;
