import { EDUCATION_LEVELS, isValidGradeForLevel } from '@aula/shared';
import { z } from 'zod';
import { idSchema } from '../academic/academic.dto.js';

// DTOs de reportes (RF-57..60). Formatos de exportación: XLSX (exceljs) y PDF (Gotenberg).

export const REPORT_FORMATS = ['XLSX', 'PDF'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const format = z.enum(REPORT_FORMATS);

export const exportRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SECTION_EXPORT'),
      courseSectionId: idSchema,
      periodId: idSchema,
      format,
    })
    .strict(),
  z
    .object({
      type: z.literal('BULK_EXPORT'),
      academicYearId: idSchema,
      periodId: idSchema,
      format,
    })
    .strict(),
]);
export type ExportRequest = z.output<typeof exportRequestSchema>;

// Tres niveles (09/11/2026): el grado solo tiene sentido dentro de un nivel (INICIAL 3..5,
// PRIMARIA 1..6, SECUNDARIA 1..5). gradeLevel exige level y se valida con el catálogo de shared.
const levelFilter = {
  level: z.enum(EDUCATION_LEVELS).optional(),
  gradeLevel: z.coerce.number().int().optional(),
};

function refineLevelGrade(
  v: { level?: (typeof EDUCATION_LEVELS)[number]; gradeLevel?: number },
  ctx: z.RefinementCtx,
): void {
  if (v.gradeLevel === undefined) return;
  if (v.level === undefined) {
    ctx.addIssue({ code: 'custom', message: 'El grado requiere el nivel', path: ['level'] });
  } else if (!isValidGradeForLevel(v.level, v.gradeLevel)) {
    ctx.addIssue({
      code: 'custom',
      message: 'El grado no existe en el nivel indicado',
      path: ['gradeLevel'],
    });
  }
}

export const courseSectionsQuerySchema = z
  .object({
    academicYearId: idSchema.optional(),
    ...levelFilter,
    sectionId: idSchema.optional(),
  })
  .strict()
  .superRefine(refineLevelGrade);
export type CourseSectionsQuery = z.output<typeof courseSectionsQuerySchema>;

export const dashboardQuerySchema = z
  .object({
    academicYearId: idSchema,
    periodId: idSchema,
    ...levelFilter,
  })
  .strict()
  .superRefine(refineLevelGrade);
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
