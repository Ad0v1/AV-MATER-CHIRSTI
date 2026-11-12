// Anuncios (RF-32, Dev 5): tipos de la API y lógica pura compartida por las pantallas del docente,
// del ADMIN, del estudiante y del apoderado. La API vuelve a validar todo.
import {
  gradeLabel,
  isEducationLevel,
  isValidGradeForLevel,
  sectionLabel,
  type EducationLevel,
} from '../../admin/estructura/_lib/levels';

export const TITLE_MAX = 150;
export const BODY_MAX = 5000;

export type AnnouncementScope = 'INSTITUTION' | 'GRADE' | 'COURSE_SECTION';

export type Announcement = {
  id: string;
  scope: AnnouncementScope;
  /** Nivel del grado (solo GRADE). */
  level: EducationLevel | null;
  gradeLevel: number | null;
  courseSectionId: string | null;
  course: { id: string; name: string } | null;
  section: { level: EducationLevel; gradeLevel: number; code: string } | null;
  title: string;
  /** Texto plano: se muestra como texto, nunca como HTML. */
  body: string;
  publishedAt: string;
  updatedAt: string;
  edited: boolean;
  canEdit: boolean;
  students?: { id: string; fullName: string }[];
};

export type AnnouncementPage = {
  items: Announcement[];
  page: number;
  pageSize: number;
  total: number;
};

export type AnnouncementField = 'title' | 'body' | 'level' | 'gradeLevel';
export type AnnouncementInput = { title: string; body: string };
export type Validated<T> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<AnnouncementField, string>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Igual que la API: normaliza saltos de línea, recorta y valida largo y caracteres. */
export function validateAnnouncement(input: {
  title: unknown;
  body: unknown;
}): Validated<AnnouncementInput> {
  const errors: Partial<Record<AnnouncementField, string>> = {};
  const title = typeof input.title === 'string' ? input.title.replace(/\r\n?/g, '\n').trim() : '';
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!title) errors.title = 'Escribe un título.';
  else if (title.length > TITLE_MAX) errors.title = `Máximo ${TITLE_MAX} caracteres.`;
  else if (title.includes('\n')) errors.title = 'El título debe ser de una sola línea.';
  else if (CONTROL.test(title)) errors.title = 'Contiene caracteres no permitidos.';
  if (!body) errors.body = 'Escribe el mensaje.';
  else if (body.length > BODY_MAX) errors.body = `Máximo ${BODY_MAX} caracteres.`;
  else if (CONTROL.test(body)) errors.body = 'Contiene caracteres no permitidos.';
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, value: { title, body } };
}

/** Nivel educativo válido o null. */
export function parseLevel(v: unknown): EducationLevel | null {
  return isEducationLevel(v) ? v : null;
}

/** Grado válido dentro del nivel (INICIAL 3..5, PRIMARIA 1..6, SECUNDARIA 1..5) o null. */
export function parseGradeLevel(level: EducationLevel, v: unknown): number | null {
  const n = typeof v === 'string' && v !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return isValidGradeForLevel(level, n) ? n : null;
}

export function scopeLabel(
  a: Pick<Announcement, 'scope' | 'level' | 'gradeLevel' | 'course' | 'section'>,
) {
  if (a.scope === 'INSTITUTION') return 'Toda la institución';
  if (a.scope === 'GRADE') {
    return a.level && a.gradeLevel !== null
      ? gradeLabel(a.level, a.gradeLevel)
      : `${a.gradeLevel}.° grado`;
  }
  const where = a.section
    ? ` · ${sectionLabel(a.section.level, a.section.gradeLevel, a.section.code)}`
    : '';
  return `${a.course?.name ?? 'Curso'}${where}`;
}

const limaDate = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatPublished(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : limaDate.format(d);
}

/** Total de páginas (mínimo 1). */
export function pageCount(p: Pick<AnnouncementPage, 'total' | 'pageSize'>): number {
  return Math.max(1, Math.ceil(p.total / Math.max(1, p.pageSize)));
}

/** ?page=N válido (1..500) o 1. */
export function parsePage(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 1;
}
