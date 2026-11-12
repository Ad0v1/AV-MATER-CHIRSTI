'use server';

// Tareas y entregas del curso (Dev 3, RF-28/33/36/37/39): la web solo reenvía al API (D-037);
// permisos, plazos y RN-10 los decide el backend. La subida usa startUpload/finishUpload de _materials.
import { refresh } from 'next/cache';
import { apiServer } from '@/lib/api/server';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import {
  buildAssignmentBody,
  buildAssignmentPatch,
  isAssignmentInput,
  isSafeHttpUrl,
  type NewAssignmentInput,
} from './assignment-format';
import type { SubmissionAccepted } from './types';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function createAssignment(
  courseSectionId: string,
  input: NewAssignmentInput,
): Promise<Result> {
  if (!isAssignmentInput(input) || !UUID.test(courseSectionId) || !UUID.test(input.periodId)) {
    return { ok: false, message: 'Datos no válidos.' };
  }
  const built = buildAssignmentBody(input);
  if (!built.ok) return built;
  const result = await run(() =>
    apiServer.post(`/course-sections/${courseSectionId}/assignments`, built.body),
  );
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

export async function submitAssignment(
  assignmentId: string,
  fileId: string,
): Promise<Result<SubmissionAccepted>> {
  if (!UUID.test(assignmentId) || !UUID.test(fileId)) {
    return { ok: false, message: 'Datos no válidos.' };
  }
  const result = await run(() =>
    apiServer.post<SubmissionAccepted>(`/assignments/${assignmentId}/submissions`, { fileId }),
  );
  if (result.ok) refresh();
  return result;
}

export type DeleteResult = { ok: true } | { ok: false; message: string; conflict: boolean };

/** RF-29/30: PATCH solo con los campos cambiados; el período no se edita (lo exige el API). */
export async function updateAssignment(
  assignmentId: string,
  original: NewAssignmentInput,
  input: NewAssignmentInput,
): Promise<Result> {
  if (!UUID.test(assignmentId) || !isAssignmentInput(original) || !isAssignmentInput(input)) {
    return { ok: false, message: 'Datos no válidos.' };
  }
  const built = buildAssignmentPatch(original, input);
  if (!built.ok) return { ok: false, message: built.errors[built.first] ?? 'Revisa los datos.' };
  if (!built.changed) return { ok: false, message: 'No hay cambios que guardar.' };
  const result = await run(() => apiServer.patch(`/assignments/${assignmentId}`, built.patch));
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

/** RF-30/RN-10: el API responde 409 si ya hay entregas o notas; la web lo avisa y sugiere editar. */
export async function deleteAssignment(assignmentId: string): Promise<DeleteResult> {
  if (!UUID.test(assignmentId)) return { ok: false, message: 'Datos no válidos.', conflict: false };
  try {
    await apiServer.delete(`/assignments/${assignmentId}`);
  } catch (error) {
    const conflict = error instanceof ApiError && error.status === 409;
    return { ok: false, message: toUserMessage(error), conflict };
  }
  refresh();
  return { ok: true };
}

/**
 * RNF-03: URL firmada nueva (vence en 60 s) para descargar el PDF de una entrega. El API verifica
 * que quien pide sea el estudiante dueño o el docente/ADMIN del curso. No se cachea ni se registra.
 */
export async function getSubmissionDownloadUrl(fileId: string): Promise<Result<{ url: string }>> {
  if (!UUID.test(fileId)) return { ok: false, message: 'Archivo no válido.' };
  const result = await run(() =>
    apiServer.post<{ url: string; expiresAt: string }>(`/files/${fileId}/download-url`, {}),
  );
  if (!result.ok) return result;
  const url = result.data?.url;
  if (!isSafeHttpUrl(url)) return { ok: false, message: 'El enlace no es válido.' };
  return { ok: true, data: { url } };
}
