import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const loginSchema = z
  .object({
    // Codigo de usuario de 10 digitos (RF-68). El digito de control se comprueba en el servicio.
    code: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'debe tener 10 digitos'),
    password: z.string().min(1).max(256),
    // Codigo de 6 digitos de la app autenticadora; solo se exige si la cuenta tiene 2FA.
    totp: z
      .string()
      .regex(/^\d{6}$/, 'debe tener 6 digitos')
      .optional(),
    // Codigo de recuperacion de un solo uso (RF-85), en lugar del de la app: XXXXX-XXXXX.
    recoveryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{5}[\s-]?[A-Za-z0-9]{5}$/, 'formato XXXXX-XXXXX')
      .optional(),
  })
  .refine(
    (v) => !(v.totp && v.recoveryCode),
    'envia el codigo de la app o uno de recuperacion, no ambos',
  );

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'debe tener 6 digitos'),
});

// La politica de contrasenas (RF-73) se comprueba en el servicio, que da un mensaje por problema.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});

const userCode = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'debe tener 10 digitos');
const sixDigits = z.string().regex(/^\d{6}$/, 'debe tener 6 digitos');

// RF-07: dos casillas separadas y obligatorias; el apoderado marca ademas la tercera.
const mustBeTrue = (message: string) => z.boolean().refine((v) => v, message);
export const acceptPolicySchema = z.object({
  privacy: mustBeTrue('debes aceptar la politica de privacidad'),
  terms: mustBeTrue('debes aceptar los terminos de uso'),
  onBehalfOfWards: z.boolean().optional(),
});

export const startEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  // RF-81: el alumno sin correo propio registra el de su apoderado.
  guardian: z.boolean().optional(),
});
export const verifyEmailSchema = z.object({ code: sixDigits });

export const recoverRequestSchema = z.object({ code: userCode });
export const recoverConfirmSchema = z.object({
  code: userCode,
  emailCode: sixDigits,
  newPassword: z.string().min(1).max(256),
});

export const manualEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  reason: z.string().trim().min(10).max(500),
});
export const userIdSchema = z.object({ id: z.uuid() });

// RF-83: telefono de 9 digitos y direccion opcional. Un campo en null lo borra.
export const updateProfileSchema = z
  .strictObject({
    phone: z
      .string()
      .trim()
      .regex(/^\d{9}$/, 'debe tener 9 digitos')
      .nullable()
      .optional(),
    address: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .refine((v) => v.phone !== undefined || v.address !== undefined, {
    message: 'Debes enviar al menos un campo',
  });
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

export type LoginDto = z.infer<typeof loginSchema>;
export type AcceptPolicyDto = z.infer<typeof acceptPolicySchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

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
