import { z } from 'zod';
import { idSchema } from '../users.dto.js';
import { PROMOTION_ACTIONS } from './promotion-policy.js';

// Entradas de la promoción en bloque (RF-16, INFORME 1 de F6, regla B1). Estrictas: un campo de
// más responde 400.

/** Máximo de decisiones por confirmación. */
export const MAX_DECISIONS = 2000;

export const promotionProposalQuerySchema = z.strictObject({ sourceYearId: idSchema });
export type PromotionProposalQuery = z.output<typeof promotionProposalQuerySchema>;

export const promotionCommitSchema = z.strictObject({
  sourceYearId: idSchema,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'La huella no es válida'),
  decisions: z
    .array(
      z.strictObject({
        enrollmentId: idSchema,
        action: z.enum(PROMOTION_ACTIONS),
        sectionId: idSchema.optional(),
      }),
    )
    .min(1)
    .max(MAX_DECISIONS)
    .refine((ds) => new Set(ds.map((d) => d.enrollmentId)).size === ds.length, {
      message: 'Las matrículas no se pueden repetir',
    }),
});
export type PromotionCommitDto = z.output<typeof promotionCommitSchema>;
