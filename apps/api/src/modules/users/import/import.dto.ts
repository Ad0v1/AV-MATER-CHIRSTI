import { z } from 'zod';
import { IMPORT_FORMATS, IMPORT_TYPES } from './import.constants.js';

// Entradas de la importación (Decisión 4). Estrictas: un campo de más responde 400.
// Los errores de Zod no incluyen el valor recibido (sin reportInput).

export const templateQuerySchema = z.strictObject({
  type: z.enum(IMPORT_TYPES),
  format: z.enum(IMPORT_FORMATS),
});
export type TemplateQuery = z.output<typeof templateQuerySchema>;

/** Campos del multipart de la vista previa (el archivo va aparte en `file`). */
export const previewBodySchema = z.strictObject({ type: z.enum(IMPORT_TYPES) });
export type PreviewBody = z.output<typeof previewBodySchema>;

/** Campos del multipart de la confirmación: `sha256` es el que devolvió la vista previa. */
export const commitBodySchema = z.strictObject({
  type: z.enum(IMPORT_TYPES),
  sha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Debe ser un SHA-256 de 64 caracteres hexadecimales')
    .transform((v) => v.toLowerCase()),
});
export type CommitBody = z.output<typeof commitBodySchema>;
