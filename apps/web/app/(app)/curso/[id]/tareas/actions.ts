'use server';

// Tareas y entregas del curso (Dev 3, RF-28/33/36/37/39): la web solo reenvía al API (D-037);
// permisos, plazos y RN-10 los decide el backend. La subida usa startUpload/finishUpload de _materials.
import { refresh } from 'next/cache';
import { apiServer } from '@/lib/api/server';
import { toUserMessage } from '@/lib/api/errors';
import { buildAssignmentBody, type NewAssignmentInput } from './assignment-format';
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
  if (!UUID.test(courseSectionId) || !UUID.test(input.periodId)) {
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
