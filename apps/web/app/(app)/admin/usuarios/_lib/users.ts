// Lógica pura de /admin/usuarios (RF-18..20, 22..25; RN-13), probada con Vitest.
// La API es la autoridad: estas reglas solo arman las consultas, eligen qué mostrar y dan
// mensajes junto al campo. Límites copiados de apps/api/src/modules/users/users.dto.ts (docs/03).
import type { ReasonLimits } from '../../_shared/lib/validation';
import { isUuid } from '../../_shared/lib/validation';
import { sectionLabel } from '../../_shared/lib/format';
import type { StatusTone } from '../../_shared/lib/format';
import type {
  EnrollmentEndReason,
  EnrollmentView,
  SectionOption,
  StudentChoice,
  UserListItem,
  UserRole,
  UserStatus,
} from './types';

export const USERS_PATH = '/admin/usuarios';

export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'GUARDIAN'] as const satisfies UserRole[];
export const STATUSES = ['ACTIVE', 'INACTIVE', 'WITHDRAWN'] as const satisfies UserStatus[];

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Docente',
  ADMIN: 'Administrador',
  GUARDIAN: 'Apoderado',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  WITHDRAWN: 'Retirado',
};

export const STATUS_TONES: Record<UserStatus, StatusTone> = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  WITHDRAWN: 'closed',
};

export const END_REASON_LABELS: Record<EnrollmentEndReason, string> = {
  TRANSFER: 'Traslado',
  WITHDRAWAL: 'Retiro',
  YEAR_END: 'Cierre del año',
  CORRECTION: 'Corrección',
};

export const isRole = (v: unknown): v is UserRole =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export const isStatus = (v: unknown): v is UserStatus =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

// --- Lista y filtros (GET /users) -------------------------------------------

export const USER_PAGE_SIZE = 20;
export const MAX_PAGE = 1000;
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

/** Filtros que sí van en la URL (no son datos personales). La búsqueda `q` nunca va aquí. */
export type UserFilters = {
  role?: UserRole;
  status?: UserStatus;
  gradeLevel?: number;
  sectionId?: string;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** Página 1..1000; cualquier otra cosa → 1. */
export function parsePage(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 && n <= MAX_PAGE ? n : 1;
}

/** Grado 1..5 o undefined. */
export function parseGradeLevel(raw: unknown): number | undefined {
  return typeof raw === 'string' && /^[1-5]$/.test(raw) ? Number(raw) : undefined;
}

/**
 * Filtros de la URL, normalizados. Lo que no es válido se descarta (no se manda a la API).
 * El grado y la sección solo valen con rol Estudiante (la API responde 400 si no).
 */
export function parseUserFilters(params: RawParams): UserFilters {
  const role = first(params.role);
  const status = first(params.status);
  const filters: UserFilters = { page: parsePage(first(params.page)) };
  if (isRole(role)) filters.role = role;
  if (isStatus(status)) filters.status = status;
  if (filters.role === 'STUDENT') {
    const grade = parseGradeLevel(first(params.gradeLevel));
    const sectionId = first(params.sectionId);
    if (grade !== undefined) filters.gradeLevel = grade;
    if (isUuid(sectionId)) filters.sectionId = sectionId;
  }
  return filters;
}

export type SearchText = { ok: true; q: string } | { ok: false; error: string | null };

/**
 * Texto de búsqueda (nombre o correo): 2..100 caracteres tras quitar espacios en los extremos,
 * como la API. Vacío → `{ ok: false, error: null }` (sin búsqueda).
 */
export function normalizeSearch(raw: unknown): SearchText {
  const q = typeof raw === 'string' ? raw.trim() : '';
  if (q.length === 0) return { ok: false, error: null };
  if (q.length < SEARCH_MIN) {
    return { ok: false, error: `Escribe al menos ${SEARCH_MIN} caracteres.` };
  }
  if (q.length > SEARCH_MAX) {
    return { ok: false, error: `La búsqueda no puede pasar de ${SEARCH_MAX} caracteres.` };
  }
  return { ok: true, q };
}

/**
 * Query de `GET /users`. Quita grado y sección si el rol no es Estudiante y solo incluye `q`
 * si es válido. Esta cadena solo viaja del servidor web a la API (nunca a la barra del navegador).
 */
export function buildUserListQuery(
  filters: Partial<UserFilters>,
  options: { q?: string; pageSize?: number } = {},
): string {
  const params = new URLSearchParams();
  if (filters.role && isRole(filters.role)) params.set('role', filters.role);
  if (filters.status && isStatus(filters.status)) params.set('status', filters.status);
  if (filters.role === 'STUDENT') {
    if (filters.gradeLevel !== undefined && parseGradeLevel(String(filters.gradeLevel))) {
      params.set('gradeLevel', String(filters.gradeLevel));
    }
    if (isUuid(filters.sectionId)) params.set('sectionId', filters.sectionId);
  }
  const search = normalizeSearch(options.q);
  if (search.ok) params.set('q', search.q);
  params.set('page', String(parsePage(String(filters.page ?? 1))));
  const size = options.pageSize ?? USER_PAGE_SIZE;
  params.set('pageSize', String(Number.isInteger(size) && size >= 1 && size <= 100 ? size : 20));
  return params.toString();
}

/** Enlace de la lista con los filtros y la página (sin `q` ni `pageSize`). */
export function listHref(filters: Partial<UserFilters>, page = 1): string {
  const params = new URLSearchParams(buildUserListQuery({ ...filters, page }));
  params.delete('pageSize');
  if (page <= 1) params.delete('page');
  const qs = params.toString();
  return qs ? `${USERS_PATH}?${qs}` : USERS_PATH;
}

/** Cantidad de páginas (mínimo 1, máximo el tope de la API). */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.min(Math.ceil(total / pageSize), MAX_PAGE);
}

/** "Mostrando 21–40 de 57". */
export function rangeText(page: number, pageSize: number, total: number, shown: number): string {
  if (total === 0 || shown === 0) return 'Sin resultados';
  const from = (page - 1) * pageSize + 1;
  return `Mostrando ${from}–${from + shown - 1} de ${total}`;
}

// --- Altas y edición (RF-18, RF-19, RF-22) ----------------------------------

export const FULL_NAME_MIN = 3;
export const FULL_NAME_MAX = 120;
export const EMAIL_MAX = 191;

const CONTROL_CHARS = /\p{Cc}/u;
const FORMULA_START = /^[=+\-@]/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Normalized = { ok: true; value: string } | { ok: false; error: string };

/** Mismas reglas que `fullNameSchema` de la API: 3..120, sin control ni `= + - @` al inicio. */
export function normalizeFullName(raw: unknown): Normalized {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (CONTROL_CHARS.test(t))
    return { ok: false, error: 'El nombre tiene caracteres no permitidos.' };
  if (FORMULA_START.test(t)) return { ok: false, error: 'El nombre no puede empezar por = + - @.' };
  const value = t.replace(/\s+/g, ' ');
  if (value.length < FULL_NAME_MIN || value.length > FULL_NAME_MAX) {
    return {
      ok: false,
      error: `Escribe un nombre de ${FULL_NAME_MIN} a ${FULL_NAME_MAX} caracteres.`,
    };
  }
  return { ok: true, value };
}

/** Correo en minúsculas y sin espacios en los extremos, con formato básico y máx. 191. */
export function normalizeEmail(raw: unknown): Normalized {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value.length === 0) return { ok: false, error: 'Escribe el correo institucional.' };
  if (value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value)) {
    return { ok: false, error: 'Escribe un correo válido (por ejemplo, nombre@colegio.edu.pe).' };
  }
  return { ok: true, value };
}

/** Nombre legible del `path` de un detalle de error de la API de usuarios. */
export function userPathLabel(path: string): string | undefined {
  const key = path.split('.')[0];
  const labels: Record<string, string> = {
    fullName: 'Nombre',
    institutionalEmail: 'Correo',
    sectionId: 'Sección',
    studentIds: 'Estudiantes',
    studentId: 'Estudiante',
    reason: 'Motivo',
    status: 'Estado',
  };
  return labels[key];
}

// --- Estado (RF-23) -----------------------------------------------------------

/** Estados a los que se puede pasar (todos menos el actual). */
export function statusChoices(current: UserStatus): UserStatus[] {
  return STATUSES.filter((s) => s !== current);
}

/** Motivos de este módulo (texto libre que va a la bitácora inmutable). */
export const USER_REASON_LIMITS = {
  /** Cambio de estado: opcional, 1..500 si se escribe. */
  status: { required: false, min: 1, max: 500 },
  /** Traslado: opcional, 1..500 si se escribe. */
  transfer: { required: false, min: 1, max: 500 },
  /** Revocación de vínculo (RN-13): obligatorio, 10..500. */
  revoke: { required: true, min: 10, max: 500 },
} as const satisfies Record<string, ReasonLimits>;

// --- Matrícula y traslado (RF-18, RF-20, RF-24) -------------------------------

const bySection = (a: SectionOption, b: SectionOption) =>
  a.gradeLevel - b.gradeLevel || a.code.localeCompare(b.code, 'es');

/** Secciones donde se puede matricular: las activas del año activo, por grado y código. */
export function enrollTargets(sections: readonly SectionOption[]): SectionOption[] {
  return sections.filter((s) => s.isActive).sort(bySection);
}

/**
 * Secciones válidas para trasladar (RF-24): activas, del mismo año y del mismo grado que la
 * matrícula vigente, y distintas de la actual. Sin matrícula vigente, ninguna.
 */
export function transferTargets(
  sections: readonly SectionOption[],
  current: Pick<EnrollmentView, 'academicYear' | 'section'> | null | undefined,
): SectionOption[] {
  if (!current) return [];
  return sections
    .filter(
      (s) =>
        s.isActive &&
        s.academicYearId === current.academicYear.id &&
        s.gradeLevel === current.section.gradeLevel &&
        s.id !== current.section.id,
    )
    .sort(bySection);
}

export type StudentPlan = {
  /** Puede matricularse (no tiene matrícula vigente en el año activo). */
  canEnroll: boolean;
  /** Puede trasladarse (tiene matrícula vigente y hay otra sección válida). */
  canTransfer: boolean;
  /** Por qué no se puede matricular ni trasladar, para mostrarlo. */
  notice: string | null;
};

/** Qué acciones de matrícula mostrar para un estudiante. */
export function studentPlan(
  status: UserStatus,
  current: EnrollmentView | null | undefined,
  activeYear: { sections: readonly SectionOption[] } | null,
): StudentPlan {
  if (status === 'WITHDRAWN') {
    return {
      canEnroll: false,
      canTransfer: false,
      notice: 'El estudiante está retirado: para matricularlo, primero vuelve a activarlo.',
    };
  }
  if (!activeYear) {
    return { canEnroll: false, canTransfer: false, notice: 'No hay un año académico activo.' };
  }
  if (!current) {
    const any = enrollTargets(activeYear.sections).length > 0;
    return {
      canEnroll: any,
      canTransfer: false,
      notice: any ? null : 'El año activo no tiene secciones activas.',
    };
  }
  const targets = transferTargets(activeYear.sections, current);
  return {
    canEnroll: false,
    canTransfer: targets.length > 0,
    notice:
      targets.length > 0 ? null : 'No hay otra sección activa del mismo grado para trasladarlo.',
  };
}

// --- Apoderados (RF-19, RF-25; RN-13) -----------------------------------------

export const MAX_GUARDIAN_STUDENTS = 10;

export type Selection<T> = { selected: T[]; error: string | null };

/** Agrega un estudiante a la selección (sin repetir, sin retirados, hasta `max`). */
export function addToSelection<T extends { id: string; status: UserStatus }>(
  selected: readonly T[],
  candidate: T,
  max = MAX_GUARDIAN_STUDENTS,
): Selection<T> {
  if (selected.some((s) => s.id === candidate.id)) {
    return { selected: [...selected], error: 'Ese estudiante ya está en la lista.' };
  }
  if (candidate.status === 'WITHDRAWN') {
    return { selected: [...selected], error: 'No se puede vincular a un estudiante retirado.' };
  }
  if (selected.length >= max) {
    return {
      selected: [...selected],
      error:
        max === 1
          ? 'Ya elegiste un estudiante: quítalo para elegir otro.'
          : `Puedes elegir hasta ${max} estudiantes.`,
    };
  }
  return { selected: [...selected, candidate], error: null };
}

export function removeFromSelection<T extends { id: string }>(
  selected: readonly T[],
  id: string,
): T[] {
  return selected.filter((s) => s.id !== id);
}

export type ParsedIds = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Ids de estudiantes enviados por el formulario (`FormData.getAll`): uuid, sin repetir y entre
 * `min` y `max` (la API pide 1..10 al crear un apoderado).
 */
export function parseStudentIds(
  values: readonly unknown[],
  { min = 1, max = MAX_GUARDIAN_STUDENTS }: { min?: number; max?: number } = {},
): ParsedIds {
  if (values.length < min) {
    return {
      ok: false,
      error: min === 1 ? 'Elige al menos un estudiante.' : `Elige al menos ${min} estudiantes.`,
    };
  }
  if (values.length > max) return { ok: false, error: `Puedes elegir hasta ${max} estudiantes.` };
  if (!values.every(isUuid)) {
    return { ok: false, error: 'La lista de estudiantes no es válida. Vuelve a elegirlos.' };
  }
  const ids = values as string[];
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    return { ok: false, error: 'Los estudiantes no se pueden repetir.' };
  }
  return { ok: true, ids };
}

/** Lo mínimo de un estudiante para el buscador (sin campos que no se muestran). */
export function toStudentChoice(item: UserListItem): StudentChoice {
  return {
    id: item.id,
    fullName: item.fullName,
    institutionalEmail: item.institutionalEmail,
    status: item.status,
    sectionLabel: item.currentSection
      ? sectionLabel(item.currentSection.gradeLevel, item.currentSection.code)
      : null,
  };
}

// --- Foco tras acciones (ux-accesibilidad, Decisiones 1–3 de 5a) --------------

export const userFocusIds = {
  data: 'datos-usuario',
  status: 'estado-usuario',
  enrollments: 'matriculas',
  guardians: 'apoderados',
  students: 'estudiantes-vinculados',
  link: (id: string) => `vinculo-${id}`,
} as const;

// --- Búsqueda: envío y reinicio (vuelta 1/2 de 5b, UX) ------------------------

/** Valor de `intent` con el que "Limpiar búsqueda" vuelve a la lista. */
export const CLEAR_SEARCH_INTENT = 'limpiar';

export type SearchRequest =
  { kind: 'clear' } | { kind: 'error'; error: string } | { kind: 'search'; q: string };

/**
 * Qué hacer con un envío del buscador: limpiar (solo con el `intent` de "Limpiar búsqueda"),
 * error junto al campo (también si se envía vacío) o buscar.
 */
export function searchRequest(raw: unknown, intent: unknown): SearchRequest {
  if (intent === CLEAR_SEARCH_INTENT) return { kind: 'clear' };
  const search = normalizeSearch(raw);
  if (search.ok) return { kind: 'search', q: search.q };
  return { kind: 'error', error: search.error ?? `Escribe al menos ${SEARCH_MIN} caracteres.` };
}

/**
 * `key` del buscador: cambia con los filtros de la URL, así al aplicar otros filtros React monta
 * un buscador nuevo y los resultados anteriores (de otros filtros) se descartan.
 */
export function searchResetKey(filters: Partial<UserFilters>): string {
  return `busqueda-${buildUserListQuery(filters)}`;
}

// --- Nota de alta (vuelta 1/2 de 5b, UX) ----------------------------------------

export const CREATED_NOTICE_ID = 'cuenta-creada';
export const CREATED_FLAG = 'alta';

/** Texto de la nota tras el alta (sin correo; el nombre ya es el título de la página). */
export function createdDetail(role: UserRole, sectionText: string | null): string {
  const base = `La cuenta de ${ROLE_LABELS[role].toLowerCase()} quedó registrada.`;
  return sectionText ? `${base} Matriculado en ${sectionText}.` : base;
}

/** Lo que se anuncia en la región de estado. */
export const createdNoticeText = (detail: string): string => `Cuenta creada. ${detail}`;

/** La URL sin `?alta=1` (conserva lo demás), o null si no lo tenía. */
export function withoutCreatedFlag(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has(CREATED_FLAG)) return null;
  params.delete(CREATED_FLAG);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
