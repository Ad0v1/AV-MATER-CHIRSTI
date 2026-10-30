import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LogAuditSink, type AuditRecord } from './audit.service.js';
import { PrismaAuditSink } from './prisma-audit.sink.js';

const ENTITY_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

function setup() {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { auditLog: { create } } as unknown as PrismaService;
  return { create, sink: new PrismaAuditSink(prisma) };
}

function record(extra: Partial<AuditRecord> = {}): AuditRecord {
  return { action: 'grades.update', module: 'grades', occurredAt: new Date(), ...extra };
}

describe('PrismaAuditSink', () => {
  it('RNF-14: guarda entityType y entityId cuando vienen', async () => {
    const { create, sink } = setup();
    await sink.write(record({ actorId: 'u1', entityType: 'Grade', entityId: ENTITY_ID }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorId: 'u1',
      entityType: 'Grade',
      entityId: ENTITY_ID,
    });
  });

  it('RNF-14: guarda null en entityType, entityId, actorId e ip cuando no vienen', async () => {
    const { create, sink } = setup();
    await sink.write(record());

    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorId: null,
      entityType: null,
      entityId: null,
      ip: null,
    });
  });

  it('RNF-15: recorta una ip de mas de 45 caracteres a 45', async () => {
    const { create, sink } = setup();
    await sink.write(record({ ip: '1'.repeat(100) }));

    const ip = create.mock.calls[0]![0].data.ip as string;
    expect(ip).toHaveLength(45);
    expect(ip).toBe('1'.repeat(45));
  });

  it('RNF-15: no altera una ip normal (IPv4 e IPv6 de 45 caracteres)', async () => {
    const { create, sink } = setup();
    await sink.write(record({ ip: '192.168.1.10' }));
    const ipv6 = '0000:0000:0000:0000:0000:ffff:255.255.255.255';
    await sink.write(record({ ip: ipv6.slice(0, 45) }));

    expect(create.mock.calls[0]![0].data.ip).toBe('192.168.1.10');
    expect(create.mock.calls[1]![0].data.ip).toBe(ipv6.slice(0, 45));
  });

  it('RNF-14: solo inserta, nunca actualiza ni borra', async () => {
    const update = vi.fn();
    const del = vi.fn();
    const create = vi.fn().mockResolvedValue({});
    const prisma = { auditLog: { create, update, delete: del } } as unknown as PrismaService;
    await new PrismaAuditSink(prisma).write(record());

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

describe('LogAuditSink', () => {
  afterEach(() => vi.restoreAllMocks());

  it('RNF-14: incluye entityType y entityId en el registro', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new LogAuditSink().write(record({ entityType: 'Grade', entityId: ENTITY_ID }));

    const logged = JSON.parse(log.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({
      entityType: 'Grade',
      entityId: ENTITY_ID,
      action: 'grades.update',
    });
  });

  it('RNF-15: no escribe beforeState ni afterState en el log', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new LogAuditSink().write(
      record({ beforeState: { dato: 'SECRETO-ANTES' }, afterState: { dato: 'SECRETO-DESPUES' } }),
    );

    const line = log.mock.calls[0]![0] as string;
    const logged = JSON.parse(line);
    expect(logged).not.toHaveProperty('beforeState');
    expect(logged).not.toHaveProperty('afterState');
    expect(line).not.toContain('SECRETO');
  });
});
