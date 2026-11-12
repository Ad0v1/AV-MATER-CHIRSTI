'use server';

// Acciones de /admin/almacenamiento como Server Actions (D-037): exportar datos personales
// (RF-63), consultar el estado de un trabajo y pedir la URL de descarga (RF-63, RF-65). La API
// comprueba sesión, rol ADMIN, el límite de trabajos (429 JOB_LIMIT) y deja la bitácora
// (`lifecycle.personal_data_export.request`, `job.download`). Los ids llegan del navegador: se
// validan antes de armar la ruta.
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { isUuid } from '../../_shared/lib/validation';
import type { JobView } from './storage';

export type JobActionResult = { ok: true; job: JobView } | { ok: false; message: string };

export type DownloadResult = { ok: true; url: string } | { ok: false; message: string };

const INVALID = { ok: false as const, message: 'Solicitud no válida.' };

export async function requestPersonalDataExportAction(
  studentId: unknown,
): Promise<JobActionResult> {
  if (!isUuid(studentId)) return INVALID;
  try {
    const job = await apiServer.post<JobView>(`/admin/students/${studentId}/personal-data-export`);
    return { ok: true, job };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function jobStatusAction(jobId: unknown): Promise<JobActionResult> {
  if (!isUuid(jobId)) return INVALID;
  try {
    return { ok: true, job: await apiServer.get<JobView>(`/admin/jobs/${jobId}`) };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function jobDownloadAction(jobId: unknown): Promise<DownloadResult> {
  if (!isUuid(jobId)) return INVALID;
  try {
    const signed = await apiServer.post<{ url: string }>(`/admin/jobs/${jobId}/download-url`);
    // Solo URL https/http absolutas (la firma S3); nada de javascript: ni rutas relativas.
    const url = new URL(signed.url);
    // En producción solo https:; http: solo con MinIO local en desarrollo.
    const allowed = process.env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'];
    if (!allowed.includes(url.protocol)) return INVALID;
    return { ok: true, url: url.toString() };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
