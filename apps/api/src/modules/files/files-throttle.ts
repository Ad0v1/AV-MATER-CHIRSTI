import type { AuthenticatedUser } from '../../common/auth/roles.js';

// Límite de peticiones por usuario autenticado (no por IP) para las rutas de archivos: en un
// colegio muchos alumnos salen por la misma IP (NAT), y por IP un alumno agotaría el cupo de
// toda el aula. Sin sesión se usa la IP (igual que el ThrottlerGuard global, que no se toca).
// Lo usan @Throttle de FilesController con el throttler 'default'.

type TrackedRequest = { user?: AuthenticatedUser; ip?: string; ips?: string[] };

export function trackByUser(req: Record<string, unknown>): Promise<string> {
  const r = req as TrackedRequest;
  if (r.user?.id) return Promise.resolve(`user:${r.user.id}`);
  return Promise.resolve(`ip:${r.ips?.length ? r.ips[0] : (r.ip ?? 'desconocida')}`);
}

/** 20/min por usuario para pedir subidas (contrato de la fase 3b). */
export const UPLOAD_INTENT_THROTTLE = {
  default: { limit: 20, ttl: 60_000, getTracker: trackByUser },
};

/** 30/min por usuario para confirmar (cada confirmación lee el objeto y llama a clamd). */
export const COMPLETE_THROTTLE = {
  default: { limit: 30, ttl: 60_000, getTracker: trackByUser },
};
