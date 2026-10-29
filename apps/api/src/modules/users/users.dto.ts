import { z } from 'zod';

// Esquemas de entrada del módulo users (Decisiones 3 y 4). Todos estrictos: un campo
// desconocido (p. ej. `role` en el PATCH) responde 400. Fechas: nunca las manda el cliente.

export const idSchema = z.uuid();

const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'GUARDIAN'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE', 'WITHDRAWN'] as const;

// Caracteres de control (incluye tabulador y saltos de línea).
const CONTROL_CHARS = /\p{Cc}/u;

/** Correo: sin espacios en los extremos, en minúsculas, formato válido y máx. 191. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('El correo no es válido').max(191));

// Primer carácter de una fórmula en Excel/LibreOffice (inyección de fórmulas al exportar, RF-21).
const FORMULA_START = /^[=+\-@]/;

/**
 * Nombre: sin caracteres de control, sin empezar por = + - @ (no se puede interpretar como
 * fórmula al abrir una exportación en una hoja de cálculo), espacios colapsados, 3..120.
 */
export const fullNameSchema = z
  .string()
  .trim()
  .refine((v) => !CONTROL_CHARS.test(v), { message: 'El nombre tiene caracteres no permitidos' })
  .refine((v) => !FORMULA_START.test(v), {
    message: 'El nombre no puede empezar por = + - @',
  })
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(z.string().min(3).max(120));

/**
 * Motivo de texto libre (cambio de estado, traslado). Se guarda tal cual en la bitácora, que es
 * inmutable (D-024): NO debe contener datos personales, de salud ni familiares del estudiante o su
 * familia (p. ej. "traslado a otro colegio", no el diagnóstico ni la situación familiar).
 */
const reasonSchema = z.string().trim().min(1).max(500);

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

// --- Usuarios -------------------------------------------------------------

export const listUsersQuerySchema = z
  .strictObject({
    q: z.string().trim().min(2).max(100).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(STATUSES).optional(),
    gradeLevel: z.coerce.number().int().min(1).max(5).optional(),
    sectionId: idSchema.optional(),
    academicYearId: idSchema.optional(),
    // Tope 1000: con pageSize 100 alcanza para 100 000 usuarios y evita OFFSET enormes.
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  // El grado y la sección se buscan en la matrícula: exigen role=STUDENT explícito.
  .refine(
    (v) => (v.gradeLevel === undefined && v.sectionId === undefined) || v.role === 'STUDENT',
    { message: 'El grado y la sección solo aplican con role=STUDENT', path: ['role'] },
  );
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;

export const updateUserSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    institutionalEmail: emailSchema.optional(),
  })
  .refine((v) => v.fullName !== undefined || v.institutionalEmail !== undefined, {
    message: 'Debes enviar al menos un campo',
  });
export type UpdateUserDto = z.output<typeof updateUserSchema>;

export const changeStatusSchema = z.strictObject({
  status: z.enum(STATUSES),
  reason: reasonSchema.optional(),
});
export type ChangeStatusDto = z.output<typeof changeStatusSchema>;

// --- Estudiantes y matrículas --------------------------------------------

export const createStudentSchema = z.strictObject({
  institutionalEmail: emailSchema,
  fullName: fullNameSchema,
  sectionId: idSchema,
});
export type CreateStudentDto = z.output<typeof createStudentSchema>;

export const enrollSchema = z.strictObject({ sectionId: idSchema });
export type EnrollDto = z.output<typeof enrollSchema>;

export const transferSchema = z.strictObject({
  sectionId: idSchema,
  reason: reasonSchema.optional(),
});
export type TransferDto = z.output<typeof transferSchema>;

export const listEnrollmentsQuerySchema = z.strictObject({
  academicYearId: idSchema.optional(),
});
export type ListEnrollmentsQuery = z.output<typeof listEnrollmentsQuerySchema>;

// --- Docentes y apoderados -----------------------------------------------

export const createTeacherSchema = z.strictObject({
  institutionalEmail: emailSchema,
  fullName: fullNameSchema,
});
export type CreateTeacherDto = z.output<typeof createTeacherSchema>;

export const createGuardianSchema = z.strictObject({
  institutionalEmail: emailSchema,
  fullName: fullNameSchema,
  studentIds: z
    .array(idSchema)
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Los estudiantes no se pueden repetir',
    }),
});
export type CreateGuardianDto = z.output<typeof createGuardianSchema>;

export const linkStudentSchema = z.strictObject({ studentId: idSchema });
export type LinkStudentDto = z.output<typeof linkStudentSchema>;

export const listLinksQuerySchema = z.strictObject({ includeRevoked: booleanQuery });
export type ListLinksQuery = z.output<typeof listLinksQuerySchema>;

/**
 * RN-13: revocar exige motivo (queda solo en la bitácora). La bitácora es inmutable (D-024): el
 * motivo NO debe contener datos personales, de salud ni familiares (p. ej. "vínculo registrado por
 * error", no el detalle de una disputa de custodia).
 */
export const revokeLinkSchema = z.strictObject({ reason: z.string().trim().min(10).max(500) });
export type RevokeLinkDto = z.output<typeof revokeLinkSchema>;
