import { auditQuerySchema } from './admin-audit.dto.js';
import { AdminAuditService, isSupportMode } from './admin-audit.service.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('admin-audit (RF-62, U9)', () => {
  it('modo soporte: solo ADMIN en contenidos, entregas o notas', () => {
    expect(isSupportMode('grading', 'ADMIN')).toBe(true);
    expect(isSupportMode('submissions', 'ADMIN')).toBe(true);
    expect(isSupportMode('contents', 'ADMIN')).toBe(true);
    expect(isSupportMode('grading', 'TEACHER')).toBe(false);
    expect(isSupportMode('users', 'ADMIN')).toBe(false);
    expect(isSupportMode('grading', null)).toBe(false);
  });

  it('el DTO rechaza comodines, parámetros extra y rangos inválidos', () => {
    expect(auditQuerySchema.parse({}).page).toBe(1);
    expect(auditQuerySchema.safeParse({ action: 'a%' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ module: 'Users' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ ip: '1.1.1.1' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ page: '201' }).success).toBe(false);
    expect(
      auditQuerySchema.safeParse({ from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(
      auditQuerySchema.safeParse({ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })
        .success,
    ).toBe(false);
  });

  it('arma el where y la página, sin devolver la IP', async () => {
    const row = {
      id: 'r1',
      occurredAt: new Date('2026-03-01T10:00:00Z'),
      action: 'grade.update',
      module: 'grading',
      entityType: 'Grade',
      entityId: ID,
      beforeState: null,
      afterState: { v: 1 },
      actor: { id: ID, fullName: 'Admin', role: 'ADMIN' as const },
    };
    const prisma = {
      auditLog: {
        count: vi.fn(() => Promise.resolve(51)),
        findMany: vi.fn(() => Promise.resolve([row])),
      },
    };
    const service = new AdminAuditService(prisma as never);
    const page = await service.list(
      auditQuerySchema.parse({
        actorId: ID,
        module: 'grading',
        from: '2026-01-01T00:00:00-05:00',
        page: '2',
      }),
    );
    const args = prisma.auditLog.findMany.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(args[0]).toMatchObject({
      where: {
        actorId: ID,
        module: 'grading',
        occurredAt: { gte: new Date('2026-01-01T05:00:00Z') },
      },
      skip: 50,
      take: 50,
    });
    expect(page).toMatchObject({ page: 2, pageSize: 50, total: 51 });
    expect(page.items[0]).toMatchObject({
      supportMode: true,
      occurredAt: '2026-03-01T10:00:00.000Z',
    });
    expect(page.items[0]).not.toHaveProperty('ip');
  });
});
