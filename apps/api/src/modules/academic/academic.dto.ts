import { EDUCATION_LEVELS, LEVEL_GRADES, isValidGradeForLevel } from '@aula/shared';
import { z } from 'zod';
import { MAX_YEAR, MIN_YEAR, PERIOD_COUNT } from './academic-policy.js';

// Esquemas de entrada del módulo académico (Decisión 2 del expediente F2).
// Fechas solo-día 'YYYY-MM-DD'; ids UUID; textos sin espacios en los extremos.

export const idSchema = z.uuid();

const dateOnly = z.iso.date();
const yearNumber = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

const atLeastOne = (value: Record<string, unknown>): boolean =>
  Object.values(value).some((v) => v !== undefined);
const atLeastOneMessage = { message: 'Debes enviar al menos un campo' };

// --- Años -----------------------------------------------------------------

export const createYearSchema = z.object({
  year: yearNumber,
  periods: z
    .array(
      z.object({
        sequence: z.number().int().min(1).max(PERIOD_COUNT),
        startDate: dateOnly,
        endDate: dateOnly,
      }),
    )
    .length(PERIOD_COUNT)
    .refine((ps) => new Set(ps.map((p) => p.sequence)).size === ps.length, {
      message: 'Las secuencias de los períodos no se pueden repetir',
    }),
});
export type CreateYearDto = z.output<typeof createYearSchema>;

export const updateYearSchema = z.object({ year: yearNumber });
export type UpdateYearDto = z.output<typeof updateYearSchema>;

// --- Períodos -------------------------------------------------------------

export const updatePeriodSchema = z
  .object({ startDate: dateOnly.optional(), endDate: dateOnly.optional() })
  .refine(atLeastOne, atLeastOneMessage);
export type UpdatePeriodDto = z.output<typeof updatePeriodSchema>;

export const closePeriodSchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .default({});
export type ClosePeriodDto = z.output<typeof closePeriodSchema>;

// RF-11 / RN-10: reabrir exige motivo.
export const reopenPeriodSchema = z.object({ reason: z.string().trim().min(10).max(500) });
export type ReopenPeriodDto = z.output<typeof reopenPeriodSchema>;

// --- Secciones ------------------------------------------------------------

/** Código de sección: 1..8 letras o dígitos, en mayúsculas (también lo usa la importación, RF-21). */
export const sectionCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{1,8}$/, 'Usa de 1 a 8 letras o dígitos'));

/** Nivel educativo (tres niveles, 09/11/2026). */
export const educationLevelSchema = z.enum(EDUCATION_LEVELS);

// El grado se valida contra el rango del nivel (INICIAL 3..5, PRIMARIA 1..6, SECUNDARIA 1..5).
export const createSectionSchema = z
  .object({
    level: educationLevelSchema,
    gradeLevel: z.number().int(),
    code: sectionCode,
  })
  .refine((v) => isValidGradeForLevel(v.level, v.gradeLevel), {
    path: ['gradeLevel'],
    message: `Grado fuera del rango del nivel (Inicial ${LEVEL_GRADES.INICIAL.min}..${LEVEL_GRADES.INICIAL.max}, Primaria ${LEVEL_GRADES.PRIMARIA.min}..${LEVEL_GRADES.PRIMARIA.max}, Secundaria ${LEVEL_GRADES.SECUNDARIA.min}..${LEVEL_GRADES.SECUNDARIA.max})`,
  });
export type CreateSectionDto = z.output<typeof createSectionSchema>;

export const updateSectionSchema = z
  .object({ code: sectionCode.optional(), isActive: z.boolean().optional() })
  .refine(atLeastOne, atLeastOneMessage);
export type UpdateSectionDto = z.output<typeof updateSectionSchema>;

// --- Cursos ---------------------------------------------------------------

const courseName = z.string().trim().min(1).max(120);

export const listCoursesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListCoursesQuery = z.output<typeof listCoursesQuerySchema>;

export const createCourseSchema = z.object({ name: courseName });
export type CreateCourseDto = z.output<typeof createCourseSchema>;

export const updateCourseSchema = z
  .object({ name: courseName.optional(), isActive: z.boolean().optional() })
  .refine(atLeastOne, atLeastOneMessage);
export type UpdateCourseDto = z.output<typeof updateCourseSchema>;

// --- Curso-sección --------------------------------------------------------

export const createCourseSectionSchema = z.object({
  courseId: idSchema,
  teacherId: idSchema.nullable().optional(),
});
export type CreateCourseSectionDto = z.output<typeof createCourseSectionSchema>;

export const updateCourseSectionSchema = z.object({ isActive: z.boolean() });
export type UpdateCourseSectionDto = z.output<typeof updateCourseSectionSchema>;

// D-029: asignar, reasignar o quitar (null) al docente.
export const assignTeacherSchema = z.object({ teacherId: idSchema.nullable() });
export type AssignTeacherDto = z.output<typeof assignTeacherSchema>;

// --- Clonación de estructura (RF-15) --------------------------------------

// Estricto: un campo de más es 400 (INFORME 1 de F6, regla A1).
export const cloneStructureSchema = z.strictObject({
  sourceYearId: idSchema,
  copyTeachers: z.boolean().default(false),
});
export type CloneStructureDto = z.output<typeof cloneStructureSchema>;
