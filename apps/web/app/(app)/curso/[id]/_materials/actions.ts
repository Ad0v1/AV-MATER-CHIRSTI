'use server';

// Materiales del curso (Dev 3, RF-26/27/29/30): la web solo reenvía al API (D-037); permisos en el backend.
import { refresh } from 'next/cache';
import { apiServer } from '@/lib/api/server';
import { toUserMessage } from '@/lib/api/errors';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export type UploadIntent = {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers?: Record<string, string>;
};

/** Sin `target` sube un material; con `target` sube la entrega de una tarea (Dev 3, fase 3f). */
export type UploadTarget = { purpose: 'SUBMISSION'; assignmentId: string };

export async function startUpload(
  courseSectionId: string,
  fileName: string,
  sizeBytes: number,
  target?: UploadTarget,
) {
  if (!UUID.test(courseSectionId)) return { ok: false, message: 'Curso no válido.' } as const;
  if (target && (target.purpose !== 'SUBMISSION' || !UUID.test(target.assignmentId))) {
    return { ok: false, message: 'Tarea no válida.' } as const;
  }
  return run(() =>
    apiServer.post<UploadIntent>('/files/upload-intents', {
      purpose: target ? 'SUBMISSION' : 'MATERIAL',
      ...(target ? { assignmentId: target.assignmentId } : {}),
      courseSectionId,
      fileName: fileName.slice(0, 200),
      sizeBytes,
      contentType: 'application/pdf',
    }),
  );
}

export async function finishUpload(fileId: string) {
  if (!UUID.test(fileId)) return { ok: false, message: 'Archivo no válido.' } as const;
  return run(() => apiServer.post(`/files/${fileId}/complete`, {}, { timeoutMs: 60_000 }));
}

export async function publishMaterial(
  courseSectionId: string,
  input: { kind: 'CLASS' | 'READING'; title: string; description?: string; fileId: string },
) {
  if (!UUID.test(courseSectionId) || !UUID.test(input.fileId)) {
    return { ok: false, message: 'Datos no válidos.' } as const;
  }
  const result = await run(() =>
    apiServer.post(`/course-sections/${courseSectionId}/materials`, {
      kind: input.kind,
      title: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      fileId: input.fileId,
    }),
  );
  if (result.ok) refresh();
  return result;
}
