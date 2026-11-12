// Lecturas de /admin/bitacora (RF-62) para Server Components. Sin 'use cache': dependen de la
// sesión (D-037).
import 'server-only';
import { apiServer } from '@/lib/api/server';
import { type AuditFilters, type AuditLogPage, buildAuditQuery } from './audit';

export function listAuditLogs(filters: AuditFilters) {
  const q = buildAuditQuery(filters);
  return apiServer.get<AuditLogPage>(`/admin/audit-logs${q ? `?${q}` : ''}`);
}
