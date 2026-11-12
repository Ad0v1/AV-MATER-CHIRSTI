'use server';

// Solicitud de exportaciones de /admin/reportes como Server Action (D-037, RF-58, RF-59). La API
// comprueba sesión, rol ADMIN, el límite de trabajos (429 JOB_LIMIT) y deja la bitácora
// (reports.export.request). El estado y la descarga reutilizan las acciones de almacenamiento
// (GET /admin/jobs/:id y POST /admin/jobs/:id/download-url).
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import type { JobActionResult } from '../../almacenamiento/_lib/actions';
import { type ExportAccepted, isExportRequest } from './reports';

export async function requestExportAction(body: unknown): Promise<JobActionResult> {
  if (!isExportRequest(body)) return { ok: false, message: 'Solicitud no válida.' };
  try {
    const accepted = await apiServer.post<ExportAccepted>('/admin/exports', body);
    return { ok: true, job: accepted.job };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
