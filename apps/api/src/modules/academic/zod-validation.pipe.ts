import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

// Mensajes de Zod en español solo para este pipe (no cambia la configuración global).
const spanish = z.locales.es();

/**
 * Valida con Zod. Si falla responde 400 VALIDATION_ERROR con
 * details = [{ path, message }] (formato de docs/03).
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value, { error: spanish.localeError });
    if (result.success) return result.data;
    throw new BadRequestException({
      message: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
}
