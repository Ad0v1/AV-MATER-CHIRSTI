import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { toAuditLogData } from './audit-log-data.js';

// Campos alineados con el modelo AuditLog propuesto (RNF-14/15).
export type AuditEvent = {
  actorId?: string;
  action: string;
  module: string;
  // Entidad sobre la que se actuo. entityType = nombre de la entidad en docs/02
  // (p. ej. 'Grade'); entityId = UUID de la raiz del agregado.
  entityType?: string;
  entityId?: string;
  // Se guarda como maximo 45 caracteres (IPv6).
  ip?: string;
  beforeState?: unknown;
  afterState?: unknown;
};

// Cliente de una transaccion interactiva de Prisma (solo se usa auditLog.create).
export type AuditTx = Pick<Prisma.TransactionClient, 'auditLog'>;

export type AuditRecord = AuditEvent & { occurredAt: Date };

// Destino de los eventos. PrismaAuditSink guarda en la tabla AuditLog, que es
// solo insercion (triggers en la BD); LogAuditSink escribe en el log.
export abstract class AuditSink {
  abstract write(record: AuditRecord): Promise<void>;
}

@Injectable()
export class LogAuditSink extends AuditSink {
  private readonly logger = new Logger('Audit');

  write(record: AuditRecord): Promise<void> {
    const { occurredAt, beforeState: _b, afterState: _a, ...safe } = record;
    // No se registran los estados completos en el log para no filtrar datos personales.
    this.logger.log(JSON.stringify({ ...safe, occurredAt: occurredAt.toISOString() }));
    return Promise.resolve();
  }
}

// Servicio compartido de bitacora (decision D-019): todos los modulos lo llaman.
@Injectable()
export class AuditService {
  constructor(private readonly sink: AuditSink) {}

  /**
   * Sin `tx`, escribe en el destino configurado. Con `tx` (D-047), inserta la fila de AuditLog con
   * el cliente de la transaccion: si falla, la transaccion se revierte y no queda accion sin rastro.
   */
  async record(event: AuditEvent, tx?: AuditTx): Promise<void> {
    const record: AuditRecord = { ...event, occurredAt: new Date() };
    if (tx) {
      await tx.auditLog.create({ data: toAuditLogData(record) });
      return;
    }
    await this.sink.write(record);
  }
}
