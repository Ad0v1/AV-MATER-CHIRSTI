import { AuditService, AuditSink, type AuditRecord, type AuditTx } from './audit.service.js';

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

  it('RNF-14: conserva entityType y entityId del evento', async () => {
    const sink = new MemorySink();
    const entityId = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    await new AuditService(sink).record({
      actorId: 'u1',
      action: 'grades.update',
      module: 'grades',
      entityType: 'Grade',
      entityId,
    });

    expect(sink.records[0]).toMatchObject({ entityType: 'Grade', entityId });
  });

  it('D-047: con tx inserta AuditLog con el cliente de la transaccion y no usa el destino', async () => {
    const sink = new MemorySink();
    const create = vi.fn().mockResolvedValue({});
    const tx = { auditLog: { create } } as unknown as AuditTx;
    await new AuditService(sink).record(
      {
        actorId: 'u1',
        action: 'contents.material.created',
        module: 'contents',
        ip: 'x'.repeat(60),
      },
      tx,
    );

    expect(sink.records).toHaveLength(0);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      actorId: 'u1',
      action: 'contents.material.created',
      module: 'contents',
    });
    expect(data.ip).toHaveLength(45);
    expect(data.occurredAt).toBeInstanceOf(Date);
    // El id lo genera la BD (UUIDv7): no se envia.
    expect(data).not.toHaveProperty('id');
  });

  it('D-047: con tx propaga el fallo para que la transaccion se revierta', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db'));
    const tx = { auditLog: { create } } as unknown as AuditTx;
    await expect(
      new AuditService(new MemorySink()).record({ action: 'a', module: 'm' }, tx),
    ).rejects.toThrow('db');
  });
});
