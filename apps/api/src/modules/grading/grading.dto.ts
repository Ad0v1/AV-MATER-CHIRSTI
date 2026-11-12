import {
  GRADE_COMMENT_MAX,
  GRADE_LITERALS,
  normalizeGradeInput,
  type NormalizedGradeInput,
} from '@aula/shared';
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

/** Cuerpo de PUT /course-sections/:id/periods/:periodId/achievements/:enrollmentId. */
export const achievementInputSchema = z.strictObject({
  literal: z.enum(GRADE_LITERALS, { error: 'El logro debe ser AD, A, B o C.' }),
  comment: z
    .string()
    .trim()
    .max(GRADE_COMMENT_MAX, `El comentario admite hasta ${GRADE_COMMENT_MAX} caracteres.`)
    .nullish()
    .transform((c) => (c === undefined || c === null || c === '' ? null : c)),
});
export type AchievementInputDto = z.output<typeof achievementInputSchema>;
