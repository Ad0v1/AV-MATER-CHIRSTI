import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
  // Codigo de 6 digitos de la app autenticadora; solo se exige si la cuenta tiene 2FA.
  totp: z
    .string()
    .regex(/^\d{6}$/, 'debe tener 6 digitos')
    .optional(),
});

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'debe tener 6 digitos'),
});

export type LoginDto = z.infer<typeof loginSchema>;

// Valida el cuerpo con Zod y responde 400 en el formato de error acordado.
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  return result.data;
}
