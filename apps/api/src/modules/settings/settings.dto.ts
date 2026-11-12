import { BadRequestException } from '@nestjs/common';
import { validateLiteralScale, type LiteralScale } from '@aula/shared';
import { z } from 'zod';

// Configuración institucional (RF-61, U11). PUT reemplaza los tres campos: la pantalla siempre
// los envía juntos. La tabla de literales la valida el motor de Dev 4 (RN-04); aquí solo la forma.

/** Mínimo de 30 días entre el cierre y la purga (seguridad 5g): da tiempo a bajar respaldos. */
export const PURGE_MIN_DAYS = 30;
export const PURGE_MAX_DAYS = 3650;
export const NAME_MIN = 3;
export const NAME_MAX = 150;
export const MAX_BANDS = 10;
/** Literal: 1..4 letras o dígitos (AD, A, B, C, A+...). Se guarda en mayúsculas. */
export const LITERAL_PATTERN = /^[\p{L}\p{N}+-]{1,4}$/u;

// Sin caracteres de control (el nombre se pinta en la web y en los reportes).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

const bandSchema = z
  .object({
    literal: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(LITERAL_PATTERN, 'Literal de 1 a 4 letras o dígitos')),
    min: z.number().int().min(0).max(20),
    max: z.number().int().min(0).max(20),
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(NAME_MIN)
      .max(NAME_MAX)
      .refine((v) => !CONTROL_CHARS.test(v), 'El nombre tiene caracteres no permitidos'),
    literalScale: z.array(bandSchema).min(1).max(MAX_BANDS),
    purgeAfterDays: z.number().int().min(PURGE_MIN_DAYS).max(PURGE_MAX_DAYS),
  })
  .strict();

export type UpdateSettingsDto = z.output<typeof updateSettingsSchema>;

/** Tramos ordenados de mayor a menor (como los muestra la pantalla). No muta la entrada. */
export function sortScale(scale: LiteralScale): LiteralScale {
  return [...scale]
    .map((b) => ({ literal: b.literal, min: b.min, max: b.max }))
    .sort((a, b) => b.min - a.min);
}

/**
 * Valida la tabla con el motor (validateLiteralScale). Si tiene problemas responde 400
 * VALIDATION_ERROR con details = [{ path: 'literalScale' | 'literalScale.<i>', message }].
 */
export function assertValidScale(scale: LiteralScale): void {
  const issues = validateLiteralScale(scale);
  if (issues.length === 0) return;
  throw new BadRequestException({
    message: issues.map((issue) => ({
      path: issue.index === undefined ? 'literalScale' : `literalScale.${issue.index}`,
      message: issue.message,
    })),
  });
}
