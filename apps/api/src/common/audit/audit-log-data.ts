import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditRecord } from './audit.service.js';

// Fila de AuditLog a partir del evento. El id lo pone la BD (UUIDv7); solo insercion.
export function toAuditLogData(record: AuditRecord): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: record.actorId ?? null,
    action: record.action,
    module: record.module,
    entityType: record.entityType ?? null,
    entityId: record.entityId ?? null,
    // La columna es VARCHAR(45): se trunca para no fallar con valores mas largos.
    ip: record.ip?.slice(0, 45) ?? null,
    beforeState: toJson(record.beforeState),
    afterState: toJson(record.afterState),
    occurredAt: record.occurredAt,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
