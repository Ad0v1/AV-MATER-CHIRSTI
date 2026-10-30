import { z } from 'zod';

// Entradas de las entregas (RF-33). Estrictas: un campo de más es 400.
export const idSchema = z.uuid();
export const submitSchema = z.strictObject({ fileId: idSchema });
export type SubmitDto = z.output<typeof submitSchema>;
