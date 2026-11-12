'use server';

// Escritura de anuncios (RF-32) como Server Actions (D-037): la web solo valida la forma y
// reenvía a la API, que decide permisos (docente asignado, autor o ADMIN) y el año escribible.
import { refresh } from 'next/cache';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import {
  isUuid,
  parseGradeLevel,
  parseLevel,
  validateAnnouncement,
  type AnnouncementField,
} from './announcements';

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; errors?: Partial<Record<AnnouncementField, string>> };

const INVALID = { ok: false, message: 'Datos no válidos. Vuelve a cargar la página.' } as const;

async function send(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (error) {
    const errors: Partial<Record<AnnouncementField, string>> = {};
    if (error instanceof ApiError) {
      for (const d of error.details) {
        if (
          d.path === 'title' ||
          d.path === 'body' ||
          d.path === 'level' ||
          d.path === 'gradeLevel'
        ) {
          errors[d.path] ??= d.message;
        }
      }
    }
    return { ok: false, message: toUserMessage(error), errors };
  }
  refresh();
  return { ok: true };
}

export async function createCourseAnnouncement(
  courseSectionId: unknown,
  title: unknown,
  body: unknown,
): Promise<ActionResult> {
  if (!isUuid(courseSectionId)) return INVALID;
  const v = validateAnnouncement({ title, body });
  if (!v.ok) return { ok: false, message: 'Revisa los campos marcados.', errors: v.errors };
  return send(() => apiServer.post(`/course-sections/${courseSectionId}/announcements`, v.value));
}

export async function createAdminAnnouncement(
  scope: unknown,
  level: unknown,
  gradeLevel: unknown,
  title: unknown,
  body: unknown,
): Promise<ActionResult> {
  if (scope !== 'INSTITUTION' && scope !== 'GRADE') return INVALID;
  const v = validateAnnouncement({ title, body });
  const lvl = scope === 'GRADE' ? parseLevel(level) : null;
  const grade = lvl ? parseGradeLevel(lvl, gradeLevel) : null;
  const errors = v.ok ? {} : { ...v.errors };
  if (scope === 'GRADE' && lvl === null) errors.level = 'Elige un nivel.';
  else if (scope === 'GRADE' && grade === null) errors.gradeLevel = 'Elige un grado.';
  if (!v.ok || Object.keys(errors).length > 0) {
    return { ok: false, message: 'Revisa los campos marcados.', errors };
  }
  const payload =
    scope === 'GRADE'
      ? { scope, level: lvl, gradeLevel: grade, ...v.value }
      : { scope, ...v.value };
  return send(() => apiServer.post('/announcements', payload));
}

export async function updateAnnouncement(
  id: unknown,
  title: unknown,
  body: unknown,
): Promise<ActionResult> {
  if (!isUuid(id)) return INVALID;
  const v = validateAnnouncement({ title, body });
  if (!v.ok) return { ok: false, message: 'Revisa los campos marcados.', errors: v.errors };
  return send(() => apiServer.patch(`/announcements/${id}`, v.value));
}

export async function deleteAnnouncement(id: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return INVALID;
  return send(() => apiServer.delete(`/announcements/${id}`));
}
