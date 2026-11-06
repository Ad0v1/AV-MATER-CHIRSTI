import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { UserRole } from '../../generated/prisma/enums.js';
import { AUDIT_PAGE_SIZE, type AuditQuery, SUPPORT_MODULES } from './admin-audit.dto.js';

export interface AuditActorView {
  id: string;
  fullName: string;
  role: UserRole;
}

/**
 * Fila de la bitácora para el ADMIN (RF-62). Sin `ip`: no hace falta para revisar quién hizo
 * qué y es un dato personal (D-024 pendiente). beforeState y afterState ya vienen sin secretos ni
 * datos sensibles de quien los escribió (docs/03, servicio de auditoría).
 */
export interface AuditLogView {
  id: string;
  occurredAt: string;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  /** null = acción del sistema (worker, barridos). */
  actor: AuditActorView | null;
  /** Modo soporte (U9, RF-55/56): un ADMIN actuó en contenidos, entregas o notas. */
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

const SUPPORT = new Set<string>(SUPPORT_MODULES);

/** U9: el modo soporte no se guarda; se deriva al leer. */
export function isSupportMode(module: string, actorRole: UserRole | null | undefined): boolean {
  return actorRole === 'ADMIN' && SUPPORT.has(module);
}

/** Bitácora de solo lectura para el ADMIN (RF-62). No escribe nada (AuditLog es solo inserción). */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQuery): Promise<AuditLogPage> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.module) where.module = query.module;
    if (query.from || query.to) {
      where.occurredAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * AUDIT_PAGE_SIZE,
        take: AUDIT_PAGE_SIZE,
        select: {
          id: true,
          occurredAt: true,
          action: true,
          module: true,
          entityType: true,
          entityId: true,
          beforeState: true,
          afterState: true,
          actor: { select: { id: true, fullName: true, role: true } },
        },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        action: r.action,
        module: r.module,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor,
        supportMode: isSupportMode(r.module, r.actor?.role),
        beforeState: r.beforeState ?? null,
        afterState: r.afterState ?? null,
      })),
      page: query.page,
      pageSize: AUDIT_PAGE_SIZE,
      total,
    };
  }
}
