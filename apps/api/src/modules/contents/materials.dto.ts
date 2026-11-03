import { z } from 'zod';
import { idSchema } from './assignments.dto.js';
import { MATERIAL_DESCRIPTION_MAX, MATERIAL_TITLE_MAX } from './materials.policy.js';

// Entradas de los materiales (RF-26/27/30). Estrictas: un campo de más es 400.

const title = z.string().trim().min(1).max(MATERIAL_TITLE_MAX);
// Descripción vacía o solo espacios se guarda como null.
const description = z
  .string()
  .trim()
  .max(MATERIAL_DESCRIPTION_MAX)
  .transform((v) => (v === '' ? null : v))
  .nullable();
const kind = z.enum(['CLASS', 'READING']);

export const createMaterialSchema = z
  .strictObject({
    kind,
    title,
    description: description.default(null),
    fileId: idSchema,
    periodId: idSchema.nullable().default(null), // D-010: opcional
    isReusable: z.boolean().default(false),
  })
  // RF-27: la marca de reutilizable es propia de las lecturas.
  .refine((v) => v.kind === 'READING' || !v.isReusable, {
    path: ['isReusable'],
    message: 'Solo las lecturas se pueden marcar como reutilizables',
  });
export type CreateMaterialDto = z.output<typeof createMaterialSchema>;

// No cambian kind, fileId ni periodId: para eso se publica otro material.
export const updateMaterialSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    isReusable: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Debes enviar al menos un campo',
  });
export type UpdateMaterialDto = z.output<typeof updateMaterialSchema>;

const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const listMaterialsQuerySchema = z.strictObject({
  kind: kind.optional(),
  periodId: idSchema.optional(),
  includeDeleted: booleanQuery, // papelera: solo docente asignado o ADMIN
});
export type ListMaterialsQuery = z.output<typeof listMaterialsQuerySchema>;
