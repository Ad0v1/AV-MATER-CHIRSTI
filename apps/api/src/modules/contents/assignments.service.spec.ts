import { ConflictException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service.js';

// RN-10 (MEDIO-1 de seguridad): DELETE /assignments/:id → 409 si la tarea ya tiene notas.
const ID = '0190a6f0-0000-7000-8000-000000000001';
const user = { id: 'u', role: 'ADMIN' } as never;
const actor = { userId: 'u' } as never;

function setup(counts: { versions: number; grades: number }) {
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ closedAt: null }])
      .mockResolvedValueOnce([{ deletedAt: null }]),
    submissionVersion: { count: vi.fn().mockResolvedValue(counts.versions) },
    grade: { count: vi.fn().mockResolvedValue(counts.grades) },
    assignment: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    assignment: {
      findFirst: vi.fn().mockResolvedValue({ id: ID, courseSectionId: 'cs', periodId: 'p' }),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const access = {
    assertCanWriteCourseSection: vi.fn().mockResolvedValue(undefined),
    assertCourseSectionWritable: vi.fn().mockResolvedValue(undefined),
    assertCanAccessCourseSection: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AssignmentsService(
    prisma as never,
    audit as never,
    access as never,
    { publish: vi.fn() } as never,
  );
  return { service, tx };
}

describe('AssignmentsService.remove (RN-10)', () => {
  it('con notas → 409 "ya tiene notas" y no borra', async () => {
    const { service, tx } = setup({ versions: 0, grades: 1 });
    const p = service.remove(ID, user, actor);
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow('La tarea ya tiene notas y no se puede eliminar');
    expect(tx.grade.count).toHaveBeenCalledWith({ where: { assignmentId: ID } });
    expect(tx.assignment.update).not.toHaveBeenCalled();
  });

  it('con entregas → 409 antes de contar notas', async () => {
    const { service, tx } = setup({ versions: 2, grades: 0 });
    await expect(service.remove(ID, user, actor)).rejects.toThrow('ya tiene entregas');
    expect(tx.assignment.update).not.toHaveBeenCalled();
  });
});
