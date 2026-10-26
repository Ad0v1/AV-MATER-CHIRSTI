import { Injectable, Logger } from '@nestjs/common';

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

  async record(event: AuditEvent): Promise<void> {
    await this.sink.write({ ...event, occurredAt: new Date() });
  }
}
