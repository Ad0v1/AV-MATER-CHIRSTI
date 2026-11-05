import { normalizeGradeInput, type NormalizedGradeInput } from '@aula/shared';
import { z } from 'zod';

// Entradas de calificaciones (RF-41, RF-42, RF-45, RF-46). Las reglas viven en el motor
// (packages/shared/src/grading/grade-input.ts); aquí solo se envuelven para ZodValidationPipe
// (Decisión del orquestador 2). Un campo desconocido se ignora, como en el motor.

export const idSchema = z.uuid();

/** Cuerpo de PUT /grades/:assignmentId/:enrollmentId, discriminado por state ("05" → "5.00"). */
export const gradeInputSchema = z.unknown().transform((body, ctx): NormalizedGradeInput => {
  const result = normalizeGradeInput(body);
  if (result.ok) return result.data;
  for (const issue of result.issues) {
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      path: issue.path === '' ? [] : [issue.path],
    });
  }
  return z.NEVER;
});
export type GradeInputDto = z.output<typeof gradeInputSchema>;

export const gradebookQuerySchema = z.strictObject({ periodId: idSchema.optional() });
export type GradebookQueryDto = z.output<typeof gradebookQuerySchema>;

export const yearQuerySchema = z.strictObject({ academicYearId: idSchema.optional() });
export type YearQueryDto = z.output<typeof yearQuerySchema>;
