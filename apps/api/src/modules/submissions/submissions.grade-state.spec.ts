import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { SubmissionsService } from './submissions.service.js';

// B2: el estado visible usa Grade.state (GRADED, NE, EXEMPT) sin N+1 y sin exponer datos de la nota.

const ASG = '00000000-0000-7000-8000-0000000000a1';
const CS = '00000000-0000-7000-8000-0000000000c1';
const assignment = {
  id: ASG,
  courseSectionId: CS,
  periodId: 'p1',
  dueAt: new Date('2099-01-01T00:00:00.000Z'),
  allowLate: false,
  maxSizeBytes: 1000,
};
const teacher = { id: 't1', role: 'TEACHER' } as unknown as AuthenticatedUser;
const student = { id: 's1', role: 'STUDENT' } as unknown as AuthenticatedUser;

function build() {
  const prisma = {
    assignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
    courseSection: { findUniqueOrThrow: vi.fn().mockResolvedValue({ sectionId: 'sec1' }) },
    enrollment: { findFirst: vi.fn().mockResolvedValue({ id: 'e1' }) },
    submission: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'sub2',
          enrollmentId: 'e2',
          versions: [
            { id: 'v1', versionNumber: 1, receivedAt: new Date(), isLate: false, fileId: 'f1' },
          ],
        },
      ]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    grade: {
      findMany: vi.fn().mockResolvedValue([
        { enrollmentId: 'e1', state: 'NE' },
        { enrollmentId: 'e2', state: 'GRADED' },
        { enrollmentId: 'e3', state: 'EXEMPT' },
      ]),
      findUnique: vi.fn().mockResolvedValue({ state: 'EXEMPT' }),
    },
  };
  const access = {
    assertTeacherOf: vi.fn().mockResolvedValue(undefined),
    assertCanAccessCourseSection: vi.fn().mockResolvedValue(undefined),
    listCurrentEnrollments: vi.fn().mockResolvedValue(
      ['e1', 'e2', 'e3', 'e4'].map((id) => ({
        enrollmentId: id,
        studentId: `st-${id}`,
        fullName: `Alumno ${id}`,
      })),
    ),
  };
  const service = new SubmissionsService(
    prisma as never,
    {} as never,
    access as never,
    {} as never,
  );
  return { service, prisma };
}

describe('SubmissionsService: gradeState (B2)', () => {
  it('lista del docente: estado de la nota por matrícula con una sola consulta', async () => {
    const { service, prisma } = build();
    const { items } = await service.listForTeacher(ASG, teacher);
    expect(items.map((i) => [i.enrollmentId, i.displayStatus])).toEqual([
      ['e1', 'NOT_SUBMITTED'],
      ['e2', 'GRADED'],
      ['e3', 'EXEMPT'],
      ['e4', 'PENDING'],
    ]);
    expect(prisma.grade.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.grade.findMany).toHaveBeenCalledWith({
      where: { assignmentId: ASG },
      select: { enrollmentId: true, state: true },
    });
  });

  it('no expone exemptionReason, comentario ni valor (D-049)', async () => {
    const { service } = build();
    const body = JSON.stringify(await service.listForTeacher(ASG, teacher));
    expect(body).not.toMatch(/exemptionReason|comment|value/);
  });

  it('vista del estudiante: usa el estado de su Grade y solo selecciona state', async () => {
    const { service, prisma } = build();
    const view = await service.mine(ASG, student);
    expect(view.displayStatus).toBe('EXEMPT');
    expect(prisma.grade.findUnique).toHaveBeenCalledWith({
      where: { assignmentId_enrollmentId: { assignmentId: ASG, enrollmentId: 'e1' } },
      select: { state: true },
    });
    expect(JSON.stringify(view)).not.toMatch(/exemptionReason|comment/);
  });

  it('vista del estudiante sin Grade: estado por entrega y plazo', async () => {
    const { service, prisma } = build();
    prisma.grade.findUnique.mockResolvedValue(null);
    expect((await service.mine(ASG, student)).displayStatus).toBe('PENDING');
  });
});
