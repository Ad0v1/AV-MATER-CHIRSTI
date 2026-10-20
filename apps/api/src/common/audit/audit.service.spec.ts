import { AuditService, AuditSink, type AuditRecord } from './audit.service.js';

class MemorySink extends AuditSink {
  records: AuditRecord[] = [];

  write(record: AuditRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}

describe('AuditService', () => {
  it('envia el evento al destino con la fecha de registro', async () => {
    const sink = new MemorySink();
    await new AuditService(sink).record({ actorId: 'u1', action: 'login', module: 'auth' });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({ actorId: 'u1', action: 'login', module: 'auth' });
    expect(sink.records[0]!.occurredAt).toBeInstanceOf(Date);
  });
});
