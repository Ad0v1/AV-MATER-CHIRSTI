import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { CALENDAR_MAX_ITEMS, CalendarService } from './calendar.service.js';

const YEAR = 'year-1';
const query = {
  from: new Date('2026-03-01T05:00:00Z'),
  to: new Date('2026-04-01T05:00:00Z'),
};
const assignment = (id: string, sectionId = 'sec-1') => ({
  id,
  title: `Tarea ${id}`,
  dueAt: new Date('2026-03-10T04:59:00Z'),
  allowLate: false,
  courseSectionId: 'cs-1',
  courseSection: {
    course: { id: 'c-1', name: 'Matemática' },
    section: { id: sectionId, gradeLevel: 3, code: 'A' },
  },
});

function setup(
  opts: {
    status?: string;
    activeYear?: boolean;
    linked?: string[];
    enrollments?: { sectionId: string; student: { id: string; fullName: string } }[];
    rows?: ReturnType<typeof assignment>[];
  } = {},
) {
  const prisma = {
    user: { findUnique: vi.fn(() => Promise.resolve({ status: opts.status ?? 'ACTIVE' })) },
    enrollment: { findMany: vi.fn(() => Promise.resolve(opts.enrollments ?? [])) },
    courseSection: { findMany: vi.fn(() => Promise.resolve([{ id: 'cs-1' }, { id: 'cs-2' }])) },
    assignment: { findMany: vi.fn(() => Promise.resolve(opts.rows ?? [assignment('a1')])) },
  };
  const access = {
    getActiveYear: vi.fn(() =>
      Promise.resolve(opts.activeYear === false ? null : { id: YEAR, year: 2026 }),
    ),
    getLinkedStudentIds: vi.fn(() => Promise.resolve(opts.linked ?? [])),
  };
  const service = new CalendarService(
    prisma as unknown as PrismaService,
    access as unknown as AcademicAccessService,
  );
  return { service, prisma, access };
}

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
  throw new Error('no lanzó');
};

describe('CalendarService (RF-54)', () => {
  it('TEACHER: sus cursos-sección activos del año activo; tareas sin borrar en el rango', async () => {
    const { service, prisma } = setup();
    const view = await service.forUser({ id: 't1', role: 'TEACHER' }, query);
    expect(prisma.courseSection.findMany).toHaveBeenCalledWith({
      where: { isActive: true, section: { isActive: true, academicYearId: YEAR }, teacherId: 't1' },
      select: { id: true },
    });
    expect(prisma.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          courseSectionId: { in: ['cs-1', 'cs-2'] },
          deletedAt: null,
          dueAt: { gte: query.from, lt: query.to },
        },
        take: CALENDAR_MAX_ITEMS + 1,
      }),
    );
    expect(view).toEqual({
      from: '2026-03-01T05:00:00.000Z',
      to: '2026-04-01T05:00:00.000Z',
      truncated: false,
      items: [
        {
          assignmentId: 'a1',
          title: 'Tarea a1',
          dueAt: '2026-03-10T04:59:00.000Z',
          allowLate: false,
          courseSectionId: 'cs-1',
          course: { id: 'c-1', name: 'Matemática' },
          section: { id: 'sec-1', gradeLevel: 3, code: 'A' },
        },
      ],
    });
    // Nunca se piden las instrucciones.
    const select = (prisma.assignment.findMany.mock.calls[0] as unknown as [{ select: object }])[0]
      .select;
    expect(select).not.toHaveProperty('instructions');
  });

  it('STUDENT: solo la sección de su matrícula vigente del año activo', async () => {
    const { service, prisma } = setup({
      enrollments: [{ sectionId: 'sec-1', student: { id: 's1', fullName: 'Ana' } }],
    });
    const view = await service.forUser({ id: 's1', role: 'STUDENT' }, query);
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: { in: ['s1'] }, academicYearId: YEAR, isCurrent: true },
      }),
    );
    expect(prisma.courseSection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sectionId: { in: ['sec-1'] } }),
      }),
    );
    expect(view.items[0]).not.toHaveProperty('students');
  });

  it('STUDENT sin matrícula vigente: vacío sin consultar tareas', async () => {
    const { service, prisma } = setup({ enrollments: [] });
    const view = await service.forUser({ id: 's1', role: 'STUDENT' }, query);
    expect(view.items).toEqual([]);
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('GUARDIAN: plazos de sus estudiantes vinculados, con a quién corresponde', async () => {
    const { service } = setup({
      linked: ['s1', 's2'],
      enrollments: [
        { sectionId: 'sec-1', student: { id: 's1', fullName: 'Ana' } },
        { sectionId: 'sec-1', student: { id: 's2', fullName: 'Beto' } },
      ],
    });
    const view = await service.forUser({ id: 'g1', role: 'GUARDIAN' }, query);
    expect(view.items[0].students).toEqual([
      { id: 's1', fullName: 'Ana' },
      { id: 's2', fullName: 'Beto' },
    ]);
  });

  it('GUARDIAN con ?studentId vinculado: solo ese estudiante', async () => {
    const { service, prisma } = setup({
      linked: ['s1', 's2'],
      enrollments: [{ sectionId: 'sec-1', student: { id: 's2', fullName: 'Beto' } }],
    });
    await service.forUser({ id: 'g1', role: 'GUARDIAN' }, { ...query, studentId: 's2' });
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: { in: ['s2'] } }) }),
    );
  });

  it('GUARDIAN con ?studentId no vinculado → 403 sin leer matrículas', async () => {
    const { service, prisma } = setup({ linked: ['s1'] });
    expect(
      await statusOf(service.forUser({ id: 'g1', role: 'GUARDIAN' }, { ...query, studentId: 'x' })),
    ).toBe(403);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('GUARDIAN sin vínculos: vacío', async () => {
    const { service, prisma } = setup({ linked: [] });
    expect((await service.forUser({ id: 'g1', role: 'GUARDIAN' }, query)).items).toEqual([]);
    expect(prisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('?studentId para un rol que no es GUARDIAN → 400', async () => {
    const { service } = setup();
    expect(
      await statusOf(service.forUser({ id: 's1', role: 'STUDENT' }, { ...query, studentId: 's2' })),
    ).toBe(400);
  });

  it('usuario no ACTIVE → 403; ADMIN → 403', async () => {
    expect(
      await statusOf(
        setup({ status: 'INACTIVE' }).service.forUser({ id: 't', role: 'TEACHER' }, query),
      ),
    ).toBe(403);
    expect(await statusOf(setup().service.forUser({ id: 'a', role: 'ADMIN' }, query))).toBe(403);
  });

  it('sin año activo: vacío', async () => {
    const { service, prisma } = setup({ activeYear: false });
    expect((await service.forUser({ id: 't1', role: 'TEACHER' }, query)).items).toEqual([]);
    expect(prisma.courseSection.findMany).not.toHaveBeenCalled();
  });

  it(`corta en ${CALENDAR_MAX_ITEMS} plazos y marca truncated`, async () => {
    const rows = Array.from({ length: CALENDAR_MAX_ITEMS + 1 }, (_, i) => assignment(`a${i}`));
    const view = await setup({ rows }).service.forUser({ id: 't1', role: 'TEACHER' }, query);
    expect(view.items).toHaveLength(CALENDAR_MAX_ITEMS);
    expect(view.truncated).toBe(true);
  });
});
