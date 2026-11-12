// Lógica pura de /admin/bitacora (RF-62, RF-55/56 con U9), probada con Vitest.
// La API es la autoridad (apps/api/src/modules/admin-audit/admin-audit.dto.ts): aquí solo se leen
// los filtros de la URL, se descartan los inválidos y se arma la consulta.
import { isUuid } from '../../_shared/lib/validation';

export const AUDIT_PATH = '/admin/bitacora';
/** Igual que AUDIT_MAX_PAGE de la API. */
export const AUDIT_MAX_PAGE = 200;
/** Igual que AUDIT_MAX_RANGE_DAYS de la API. */
export const AUDIT_MAX_RANGE_DAYS = 400;

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN';

export interface AuditLogView {
  id: string;
  occurredAt: string;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; fullName: string; role: UserRole } | null;
  supportMode: boolean;
  beforeState: unknown;
  afterState: unknown;
}

export interface AuditLogPage {
  items: AuditLogView[];
  page: number;
  pageSize: number;
  total: number;
}

/** Módulos que escriben en la bitácora (valor `module`), con su nombre para el colegio. */
export const MODULE_LABELS: Record<string, string> = {
  auth: 'Acceso',
  users: 'Usuarios',
  academic: 'Estructura académica',
  contents: 'Contenidos',
  submissions: 'Entregas',
  grading: 'Calificaciones',
  files: 'Archivos',
  settings: 'Configuración',
  announcements: 'Anuncios',
  notifications: 'Notificaciones',
  jobs: 'Trabajos y descargas',
  lifecycle: 'Ciclo de vida',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Docente',
  ADMIN: 'Administrador',
  GUARDIAN: 'Apoderado',
};

export interface AuditFilters {
  actorId?: string;
  action?: string;
  module?: string;
  /** Día YYYY-MM-DD (hora de Lima). */
  from?: string;
  to?: string;
  page: number;
}

const ACTION_RE = /^[a-z][a-z0-9_.-]*$/;
const MODULE_RE = /^[a-z][a-z0-9_-]*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function validDay(v: string | undefined): string | undefined {
  if (!v || !DAY_RE.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/** Filtros de la URL; lo inválido se ignora (no se manda a la API para que no dé 400). */
export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const actorId = first(params.actorId);
  const action = first(params.action)?.toLowerCase();
  const moduleName = first(params.module);
  let from = validDay(first(params.from));
  let to = validDay(first(params.to));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(first(params.page));
  return {
    actorId: isUuid(actorId) ? actorId.toLowerCase() : undefined,
    action: action && action.length <= 100 && ACTION_RE.test(action) ? action : undefined,
    module:
      moduleName && moduleName.length <= 40 && MODULE_RE.test(moduleName) ? moduleName : undefined,
    from,
    to,
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, AUDIT_MAX_PAGE) : 1,
  };
}

/** Días entre dos fechas YYYY-MM-DD. */
export function rangeDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** Error de rango a mostrar (la API respondería 400). null si el rango es válido. */
export function rangeError(f: AuditFilters): string | null {
  // Los días van completos (de 00:00 a 23:59:59.999 en Lima): con 400 de diferencia la API vería
  // 400 días y casi uno más. Por eso aquí el tope es estricto: hasta 399 días de diferencia.
  if (f.from && f.to && rangeDays(f.from, f.to) >= AUDIT_MAX_RANGE_DAYS) {
    return `El rango de fechas no puede pasar de ${AUDIT_MAX_RANGE_DAYS} días.`;
  }
  return null;
}

/** Consulta para la API: el día se toma completo en hora de Lima (UTC-5, sin horario de verano). */
export function buildAuditQuery(f: AuditFilters): string {
  const q = new URLSearchParams();
  if (f.actorId) q.set('actorId', f.actorId);
  if (f.action) q.set('action', f.action);
  if (f.module) q.set('module', f.module);
  if (f.from) q.set('from', `${f.from}T00:00:00.000-05:00`);
  if (f.to) q.set('to', `${f.to}T23:59:59.999-05:00`);
  if (f.page > 1) q.set('page', String(f.page));
  return q.toString();
}

/** Enlace de la pantalla con los mismos filtros (y otra página u otro actor). */
export function auditHref(f: AuditFilters, changes: Partial<AuditFilters> = {}): string {
  const next = { ...f, ...changes };
  const q = new URLSearchParams();
  if (next.actorId) q.set('actorId', next.actorId);
  if (next.action) q.set('action', next.action);
  if (next.module) q.set('module', next.module);
  if (next.from) q.set('from', next.from);
  if (next.to) q.set('to', next.to);
  if (next.page > 1) q.set('page', String(next.page));
  const s = q.toString();
  return s ? `${AUDIT_PATH}?${s}` : AUDIT_PATH;
}

export const hasAuditFilters = (f: AuditFilters): boolean =>
  !!(f.actorId || f.action || f.module || f.from || f.to);

export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.min(Math.ceil(total / pageSize), AUDIT_MAX_PAGE);
}

/** "Mostrando 51–100 de 340". */
export function rangeText(page: number, pageSize: number, total: number, shown: number): string {
  if (total === 0 || shown === 0) return 'Sin resultados';
  const from = (page - 1) * pageSize + 1;
  return `Mostrando ${from}–${from + shown - 1} de ${total}`;
}

export const moduleLabel = (m: string): string => MODULE_LABELS[m] ?? m;

/** Claves con datos personales o texto libre (seguridad 5g): el correo se oculta. */
const HIDDEN_KEY = /email|correo/i;
/** Motivos y comentarios se recortan: pueden traer nombres o detalles del estudiante. */
const TRIMMED_KEY = /reason|comment|motivo/i;
export const STATE_TEXT_MAX = 200;

/** Copia de beforeState/afterState con correos ocultos y motivos o comentarios recortados. */
export function redactState(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactState(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_KEY.test(key) && v !== null && v !== undefined) out[key] = '[oculto]';
    else if (TRIMMED_KEY.test(key) && typeof v === 'string' && v.length > STATE_TEXT_MAX) {
      out[key] = `${v.slice(0, STATE_TEXT_MAX)}…`;
    } else out[key] = redactState(v, depth + 1);
  }
  return out;
}

/** JSON legible y acotado de beforeState/afterState (nunca HTML: se muestra en un <pre>). */
export function stateText(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null;
  let text: string;
  try {
    text = JSON.stringify(redactState(value), null, 2) ?? '';
  } catch {
    return null;
  }
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}
