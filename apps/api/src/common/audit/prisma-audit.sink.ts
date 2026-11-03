import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditSink, type AuditRecord } from './audit.service.js';

// Guarda la bitacora en la tabla AuditLog. Solo inserta: la bitacora es append-only (RNF-14/15).
@Injectable()
export class PrismaAuditSink extends AuditSink {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async write(record: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
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
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
