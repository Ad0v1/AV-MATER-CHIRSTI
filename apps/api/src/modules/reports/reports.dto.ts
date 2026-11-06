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

export const courseSectionsQuerySchema = z
  .object({
    academicYearId: idSchema.optional(),
    gradeLevel: z.coerce.number().int().min(1).max(12).optional(),
    sectionId: idSchema.optional(),
  })
  .strict();
export type CourseSectionsQuery = z.output<typeof courseSectionsQuerySchema>;

export const dashboardQuerySchema = z
  .object({
    academicYearId: idSchema,
    periodId: idSchema,
    gradeLevel: z.coerce.number().int().min(1).max(12).optional(),
  })
  .strict();
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
