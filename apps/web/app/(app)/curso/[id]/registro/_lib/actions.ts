'use server';

// Calificar y ver el PDF de una entrega (Dev 4, RF-41..46, RF-43). La web solo reenvía al API
// (D-037): permisos, período cerrado (RF-50) y reglas A1 los decide el backend.
import { refresh } from 'next/cache';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { gradeErrorMessage, isUuid, type GradeFormErrors } from './grading-format';
import type { GradeInput } from './types';

export type SaveGradeResult =
  { ok: true } | { ok: false; message: string; fieldErrors?: GradeFormErrors };

const FIELDS = new Set(['state', 'value', 'comment', 'exemptionReason']);

export async function saveGrade(
  assignmentId: string,
  enrollmentId: string,
  body: GradeInput,
): Promise<SaveGradeResult> {
  if (!isUuid(assignmentId) || !isUuid(enrollmentId)) {
    return { ok: false, message: 'Datos no válidos.' };
  }
  try {
    await apiServer.put(`/grades/${assignmentId}/${enrollmentId}`, body);
  } catch (error) {
    const fieldErrors: GradeFormErrors = {};
    if (error instanceof ApiError && error.status === 400) {
      for (const d of error.details) {
        if (FIELDS.has(d.path)) fieldErrors[d.path as keyof GradeFormErrors] = d.message;
      }
    }
    const byCode = error instanceof ApiError ? gradeErrorMessage(error.code) : undefined;
    return { ok: false, message: byCode ?? toUserMessage(error), fieldErrors };
  }
  refresh();
  return { ok: true };
}

export type PdfUrlResult =
  { ok: true; url: string; expiresAt: string } | { ok: false; message: string };

/** U4: URL firmada inline (60 s) para el visor por iframe. El apoderado nunca llega aquí. */
export async function getSubmissionPdfUrl(fileId: string): Promise<PdfUrlResult> {
  if (!isUuid(fileId)) return { ok: false, message: 'Datos no válidos.' };
  try {
    const r = await apiServer.post<{ url: string; expiresAt: string }>(
      `/files/${fileId}/download-url`,
      { inline: true },
    );
    // Solo URLs http(s): nunca javascript: ni data: en el src del iframe.
    if (!/^https?:\/\//i.test(r.url)) return { ok: false, message: 'El enlace no es válido.' };
    return { ok: true, url: r.url, expiresAt: r.expiresAt };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
