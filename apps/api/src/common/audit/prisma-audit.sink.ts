import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditSink, type AuditRecord } from './audit.service.js';
import { toAuditLogData } from './audit-log-data.js';

// Guarda la bitacora en la tabla AuditLog. Solo inserta: la bitacora es append-only (RNF-14/15).
@Injectable()
export class PrismaAuditSink extends AuditSink {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async write(record: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({ data: toAuditLogData(record) });
  }
}
