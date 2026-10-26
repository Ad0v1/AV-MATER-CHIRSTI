import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AcademicAccessService } from './academic-access.service.js';

const CS = 'cs-1';
const SECTION = 'sec-3a';
const TEACHER = 'docente01';
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Year = { id: string; year: number; isActive: boolean | null; closedAt: Date | null };
const activeYear: Year = { id: 'y-2026', year: 2026, isActive: true, closedAt: null };

function makePrisma() {
  return {
    academicYear: { findFirst: vi.fn() },
    academicPeriod: { findUnique: vi.fn() },
    courseSection: { findUnique: vi.fn() },
    section: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn(), findMany: vi.fn() },
    guardianStudent: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
}

describe('AcademicAccessService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let access: AcademicAccessService;

  beforeEach(() => {
    prisma = makePrisma();
    access = new AcademicAccessService(prisma as unknown as PrismaService);
    prisma.courseSection.findUnique.mockResolvedValue({
      id: CS,
      sectionId: SECTION,
      teacherId: TEACHER,
    });
    prisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.enrollment.findFirst.mockResolvedValue(null);
    prisma.guardianStudent.findMany.mockResolvedValue([]);
  });

  describe('assertCanAccessCourseSection', () => {
    it('RNF-02: 404 si el curso-sección no existe', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(null);
      await expect(
        access.assertCanAccessCourseSection({ id: 'admin', role: 'ADMIN' }, CS),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('RNF-02: 403 si el usuario no está ACTIVE, aunque sea ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: 'INACTIVE' });
      await expect(
        access.assertCanAccessCourseSection({ id: 'admin', role: 'ADMIN' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('RNF-02: 403 si el usuario ya no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        access.assertCanAccessCourseSection({ id: 'x', role: 'ADMIN' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('RNF-02: ADMIN activo pasa', async () => {
      await expect(
        access.assertCanAccessCourseSection({ id: 'admin', role: 'ADMIN' }, CS),
      ).resolves.toBeUndefined();
    });

    it('RF-14: TEACHER pasa solo si es el docente asignado', async () => {
      await expect(
        access.assertCanAccessCourseSection({ id: TEACHER, role: 'TEACHER' }, CS),
      ).resolves.toBeUndefined();
      await expect(
        access.assertCanAccessCourseSection({ id: 'docente02', role: 'TEACHER' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('RF-14: TEACHER no pasa si el curso no tiene docente', async () => {
      prisma.courseSection.findUnique.mockResolvedValue({
        id: CS,
        sectionId: SECTION,
        teacherId: null,
      });
      await expect(
        access.assertCanAccessCourseSection({ id: TEACHER, role: 'TEACHER' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('RF-24: STUDENT pasa con matrícula vigente (isCurrent: true) en la sección', async () => {
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'e1' });
      await expect(
        access.assertCanAccessCourseSection({ id: 'est01', role: 'STUDENT' }, CS),
      ).resolves.toBeUndefined();
      expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: { in: ['est01'] }, sectionId: SECTION, isCurrent: true },
        }),
      );
    });

    it('RF-24: STUDENT sin matrícula vigente (trasladado o de otra sección) → 403', async () => {
      await expect(
        access.assertCanAccessCourseSection({ id: 'est03', role: 'STUDENT' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('RF-49: GUARDIAN pasa si un vinculado tiene matrícula vigente en la sección', async () => {
      prisma.guardianStudent.findMany.mockResolvedValue([
        { studentId: 'est01' },
        { studentId: 'est11' },
      ]);
      prisma.enrollment.findFirst.mockResolvedValue({ id: 'e1' });
      await expect(
        access.assertCanAccessCourseSection({ id: 'apo01', role: 'GUARDIAN' }, CS),
      ).resolves.toBeUndefined();
      expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: { in: ['est01', 'est11'] }, sectionId: SECTION, isCurrent: true },
        }),
      );
    });

    it('RF-49: GUARDIAN sin vinculados o sin matrícula en la sección → 403', async () => {
      await expect(
        access.assertCanAccessCourseSection({ id: 'apo03', role: 'GUARDIAN' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();

      prisma.guardianStudent.findMany.mockResolvedValue([{ studentId: 'est20' }]);
      await expect(
        access.assertCanAccessCourseSection({ id: 'apo02', role: 'GUARDIAN' }, CS),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertTeacherOf', () => {
    it('404 / 403 / pasa', async () => {
      await expect(access.assertTeacherOf(TEACHER, CS)).resolves.toBeUndefined();
      await expect(access.assertTeacherOf('docente02', CS)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      prisma.courseSection.findUnique.mockResolvedValue(null);
      await expect(access.assertTeacherOf(TEACHER, CS)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 si no hay docente asignado o el docente no está ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({ status: 'INACTIVE' });
      await expect(access.assertTeacherOf(TEACHER, CS)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.courseSection.findUnique.mockResolvedValue({
        id: CS,
        sectionId: SECTION,
        teacherId: null,
      });
      await expect(access.assertTeacherOf(TEACHER, CS)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('isPeriodOpen', () => {
    const period = (closedAt: Date | null, year: Year) => ({
      id: 'p1',
      academicYearId: year.id,
      closedAt,
      academicYear: year,
    });

    it('RN-10: true si el período y su año están abiertos y el año es el activo', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValue(period(null, activeYear));
      await expect(access.isPeriodOpen('p1')).resolves.toBe(true);
    });

    it('RN-10: false si el período está cerrado', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValue(period(new Date(), activeYear));
      await expect(access.isPeriodOpen('p1')).resolves.toBe(false);
    });

    it('RN-11: false si el año no es el activo (marcador NULL)', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValue(
        period(null, { ...activeYear, isActive: null }),
      );
      await expect(access.isPeriodOpen('p1')).resolves.toBe(false);
    });

    it('RF-17: false si el año está cerrado', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValue(
        period(null, { ...activeYear, closedAt: new Date() }),
      );
      await expect(access.isPeriodOpen('p1')).resolves.toBe(false);
    });

    it('404 si el período no existe', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValue(null);
      await expect(access.isPeriodOpen('p1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertCourseSectionWritable', () => {
    const csWith = (year: Year, sectionActive = true, csActive = true) => ({
      id: CS,
      isActive: csActive,
      section: { id: SECTION, isActive: sectionActive, academicYear: year },
    });

    beforeEach(() => {
      prisma.courseSection.findUnique.mockResolvedValue(csWith(activeYear));
    });

    it('pasa en el año activo con sección y curso activos', async () => {
      await expect(access.assertCourseSectionWritable(CS)).resolves.toBeUndefined();
    });

    it('404 si el curso-sección no existe', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(null);
      await expect(access.assertCourseSectionWritable(CS)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('RF-17: 409 si el año no está activo o está cerrado', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(csWith({ ...activeYear, isActive: null }));
      await expect(access.assertCourseSectionWritable(CS)).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.courseSection.findUnique.mockResolvedValue(
        csWith({ ...activeYear, closedAt: new Date() }),
      );
      await expect(access.assertCourseSectionWritable(CS)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('409 si la sección o el curso-sección están inactivos', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(csWith(activeYear, false));
      await expect(access.assertCourseSectionWritable(CS)).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.courseSection.findUnique.mockResolvedValue(csWith(activeYear, true, false));
      await expect(access.assertCourseSectionWritable(CS)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('con período: 404 si no existe, 422 si es de otro año, 409 si está cerrado', async () => {
      prisma.academicPeriod.findUnique.mockResolvedValueOnce(null);
      await expect(access.assertCourseSectionWritable(CS, 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      prisma.academicPeriod.findUnique.mockResolvedValueOnce({
        id: 'p1',
        academicYearId: 'y-2025',
        closedAt: null,
      });
      await expect(access.assertCourseSectionWritable(CS, 'p1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      prisma.academicPeriod.findUnique.mockResolvedValueOnce({
        id: 'p1',
        academicYearId: activeYear.id,
        closedAt: new Date(),
      });
      await expect(access.assertCourseSectionWritable(CS, 'p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      prisma.academicPeriod.findUnique.mockResolvedValueOnce({
        id: 'p1',
        academicYearId: activeYear.id,
        closedAt: null,
      });
      await expect(access.assertCourseSectionWritable(CS, 'p1')).resolves.toBeUndefined();
    });
  });

  describe('getCourseSectionContext', () => {
    const periodsOf = (year: Year) =>
      [
        ['FIRST_BIMESTER', 'I Bimestre', '03-01', '04-30', day('2026-05-05')],
        ['SECOND_BIMESTER', 'II Bimestre', '05-01', '06-30', null],
      ].map(([kind, label, start, end, closedAt], i) => ({
        id: `p${i + 1}`,
        academicYearId: year.id,
        sequence: i + 1,
        kind,
        label,
        startDate: day(`${year.year}-${start as string}`),
        endDate: day(`${year.year}-${end as string}`),
        closedAt,
      }));

    const contextRow = (year: Year, sectionActive = true) => ({
      id: CS,
      isActive: true,
      sectionId: SECTION,
      course: { id: 'c1', name: 'Matemática' },
      teacher: { id: TEACHER, fullName: 'Docente Ficticio 01' },
      section: {
        id: SECTION,
        gradeLevel: 3,
        code: 'A',
        isActive: sectionActive,
        academicYear: { ...year, periods: periodsOf(year) },
      },
    });

    it('RF-10: arma el contexto con períodos, marcador como boolean y período actual', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(contextRow(activeYear));
      const ctx = await access.getCourseSectionContext(CS, new Date('2026-05-20T15:00:00Z'));
      expect(ctx).toMatchObject({
        id: CS,
        readOnly: false,
        academicYear: { id: 'y-2026', year: 2026, isActive: true, closedAt: null },
        section: { id: SECTION, gradeLevel: 3, code: 'A', isActive: true },
        teacher: { id: TEACHER, fullName: 'Docente Ficticio 01' },
        currentPeriodId: 'p2',
      });
      expect(ctx.periods[0]).toMatchObject({
        startDate: '2026-03-01',
        endDate: '2026-04-30',
        closedAt: '2026-05-05T00:00:00.000Z',
        isOpen: false,
      });
      expect(ctx.periods[1].isOpen).toBe(true);
    });

    it('RF-17: año no activo (NULL) → isActive false, readOnly y períodos no abiertos', async () => {
      const past: Year = { id: 'y-2025', year: 2025, isActive: null, closedAt: day('2026-01-05') };
      prisma.courseSection.findUnique.mockResolvedValue(contextRow(past));
      prisma.academicYear.findFirst.mockResolvedValue({ id: 'y-2026', year: 2026 });
      const ctx = await access.getCourseSectionContext(CS, new Date('2026-05-20T15:00:00Z'));
      expect(ctx.academicYear.isActive).toBe(false);
      expect(ctx.readOnly).toBe(true);
      expect(ctx.periods.every((p) => !p.isOpen)).toBe(true);
      expect(ctx.currentPeriodId).toBeNull();
    });

    it('readOnly si la sección está inactiva', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(contextRow(activeYear, false));
      const ctx = await access.getCourseSectionContext(CS);
      expect(ctx.readOnly).toBe(true);
    });

    it('404 si no existe', async () => {
      prisma.courseSection.findUnique.mockResolvedValue(null);
      await expect(access.getCourseSectionContext(CS)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('matrículas y vínculos', () => {
    it('RF-24: listCurrentEnrollments filtra isCurrent: true y ordena por nombre', async () => {
      prisma.section.findUnique.mockResolvedValue({ id: SECTION });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 'est59',
          effectiveFrom: day('2026-03-01'),
          student: { fullName: 'Estudiante Ficticio 59', status: 'INACTIVE' },
        },
      ]);
      await expect(access.listCurrentEnrollments(SECTION)).resolves.toEqual([
        {
          enrollmentId: 'e1',
          studentId: 'est59',
          fullName: 'Estudiante Ficticio 59',
          status: 'INACTIVE',
          effectiveFrom: '2026-03-01T00:00:00.000Z',
        },
      ]);
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sectionId: SECTION, isCurrent: true },
          orderBy: { student: { fullName: 'asc' } },
        }),
      );
    });

    it('listCurrentEnrollments: 404 si la sección no existe', async () => {
      prisma.section.findUnique.mockResolvedValue(null);
      await expect(access.listCurrentEnrollments(SECTION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('RF-24: listEnrollmentsOfStudent convierte el marcador NULL en false', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          sectionId: 's3a',
          academicYearId: 'y-2026',
          isCurrent: null,
          effectiveFrom: day('2026-03-01'),
          effectiveTo: day('2026-06-15'),
          endReason: 'TRANSFER',
        },
        {
          id: 'e2',
          sectionId: 's3b',
          academicYearId: 'y-2026',
          isCurrent: true,
          effectiveFrom: day('2026-06-15'),
          effectiveTo: null,
          endReason: null,
        },
      ]);
      const rows = await access.listEnrollmentsOfStudent('est03', 'y-2026');
      expect(rows.map((r) => r.isCurrent)).toEqual([false, true]);
      expect(rows[0]).toMatchObject({
        effectiveTo: '2026-06-15T00:00:00.000Z',
        endReason: 'TRANSFER',
      });
    });

    it('RF-49: getLinkedStudentIds devuelve solo ids', async () => {
      prisma.guardianStudent.findMany.mockResolvedValue([{ studentId: 'a' }, { studentId: 'b' }]);
      await expect(access.getLinkedStudentIds('apo01')).resolves.toEqual(['a', 'b']);
    });

    it('getActiveYear consulta el marcador TRUE', async () => {
      prisma.academicYear.findFirst.mockResolvedValue({ id: 'y-2026', year: 2026 });
      await expect(access.getActiveYear()).resolves.toEqual({ id: 'y-2026', year: 2026 });
      expect(prisma.academicYear.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });
});
