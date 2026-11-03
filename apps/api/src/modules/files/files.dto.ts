import { z } from 'zod';
import { idSchema } from '../academic/academic.dto.js';
import { PDF_CONTENT_TYPE } from '../storage/index.js';

// Contratos de la fase 3b (INFORME 1 del expediente de Dev 3). Esquemas estrictos: un campo
// de más responde 400.

export const uploadIntentSchema = z.strictObject({
  purpose: z.enum(['MATERIAL', 'ASSIGNMENT_ATTACHMENT', 'SUBMISSION']),
  courseSectionId: idSchema,
  assignmentId: idSchema.optional(),
  fileName: z.string().trim().min(1).max(255),
  // El tope real (el de la tarea o 50 MiB) se aplica en el servicio con 413.
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contentType: z.literal(PDF_CONTENT_TYPE),
});
export type UploadIntentDto = z.output<typeof uploadIntentSchema>;

export const downloadUrlSchema = z
  .strictObject({ inline: z.boolean().optional() })
  .optional()
  .transform((v) => v ?? {});
export type DownloadUrlDto = z.output<typeof downloadUrlSchema>;

export type UploadIntentResponse = {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
};

export type CompleteResponse = {
  fileId: string;
  scanStatus: 'CLEAN';
  sizeBytes: number;
  sha256: string;
  /** Hora del servidor al confirmar la subida (receivedAt de la entrega, decisión 2). */
  completedAt: string;
};

export type DownloadUrlResponse = { url: string; method: 'GET'; expiresAt: string };
