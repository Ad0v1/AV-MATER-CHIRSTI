import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import { AcademicEventPublisher, type AcademicEvent } from '../academic/academic-events.js';
import { EnrollmentsService } from './enrollments.service.js';
import {
  actor,
  enrollmentRow,
  makePrisma,
  prismaError,
  section,
  userRow,
  YEAR_2025,
  YEAR_2026,
} from './users-prisma.mock-spec.js';

const NOW = new Date('2026-10-26T15:00:00.000Z');

describe('EnrollmentsService', () => {
  let db: ReturnType<typeof makePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let events: AcademicEventPublisher;
  let order: string[];
  let published: AcademicEvent[];
  let service: EnrollmentsService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = makePrisma();
    order = [];
    published = [];
    audit = {
      record: vi.fn((e: { action: string }) => {
        order.push(`audit:${e.action}`);
        return Promise.resolve();
      }),
    };
    events = new AcademicEventPublisher();
    events.on('enrollment.transferred.v1', (e) => {
      published.push(e);
      order.push(`event:${e.type}`);
    });
    service = new EnrollmentsService(
      db.asService,
      audit as unknown as AuditService,
      events,
      'colegio.example',
    );
    db.raw.years.set(YEAR_2026, { id: YEAR_2026, active: 1, open: 1 });
    db.raw.years.set(YEAR_2025, { id: YEAR_2025, active: 0, open: 0 });
    db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
  });
  afterEach(() => vi.useRealTimers());

  describe('createStudent (RF-18)', () => {
    const dto = {
      institutionalEmail: 'qa-f3-1@colegio.example',
      fullName: 'Estudiante QA',
      sectionId: 's3a',
    };

    beforeEach(() => {
      db.prisma.user.findUnique.mockResolvedValue(null);
      db.prisma.section.findUnique.mockResolvedValue(section('s3a', 3));
      db.prisma.user.create.mockResolvedValue(userRow('nuevo', 'STUDENT'));
      db.prisma.enrollment.create.mockResolvedValue({
        ...enrollmentRow('enr-n', 's3a'),
        studentId: 'nuevo',
      });
    });

    it('crea usuario y matrícula en una transacción, con sección y año de la fila de Section', async () => {
      const result = await service.createStudent(dto, actor);
      expect(db.rawCalls).toHaveLength(1);
      expect(db.rawCalls[0].sql).toContain('FOR SHARE');
      expect(db.prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            studentId: 'nuevo',
            sectionId: 's3a',
            academicYearId: YEAR_2026,
            effectiveFrom: NOW,
          },
        }),
      );
      expect(result.enrollment.isCurrent).toBe(true);
      expect(order).toEqual(['audit:users.user.create', 'audit:users.enrollment.create']);
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('@colegio');
    });

    it('422 dominio y 409 correo repetido', async () => {
      await expect(
        service.createStudent({ ...dto, institutionalEmail: 'x@otro.example' }, actor),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      db.prisma.user.findUnique.mockResolvedValue({ id: 'otro' });
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 sección inexistente', async () => {
      db.prisma.section.findUnique.mockResolvedValue(null);
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 año cerrado, 409 sin año activo y 422 sección de otro año', async () => {
      db.prisma.section.findUnique.mockResolvedValue(
        section('s2a-25', 2, { academicYearId: YEAR_2025 }),
      );
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(ConflictException);

      db.raw.years.set('y-2027', { id: 'y-2027', active: 0, open: 1 });
      db.prisma.section.findUnique.mockResolvedValue(
        section('s1a-27', 1, { academicYearId: 'y-2027' }),
      );
      db.prisma.academicYear.findFirst.mockResolvedValueOnce({ id: YEAR_2026 });
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      db.prisma.academicYear.findFirst.mockResolvedValueOnce(null);
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.user.create).not.toHaveBeenCalled();
    });

    it('409 sección inactiva', async () => {
      db.prisma.section.findUnique.mockResolvedValue(section('s3a', 3, { isActive: false }));
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });

    it('P2002 en la carrera del correo → 409', async () => {
      db.prisma.user.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.createStudent(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('enroll', () => {
    beforeEach(() => {
      db.prisma.section.findUnique.mockResolvedValue(section('s3a', 3));
      db.prisma.enrollment.findFirst.mockResolvedValue(null);
      db.prisma.enrollment.create.mockResolvedValue(enrollmentRow('enr-n', 's3a'));
    });

    it('bloquea User FOR UPDATE y luego el año FOR SHARE', async () => {
      await service.enroll('est1', { sectionId: 's3a' }, actor);
      expect(db.rawCalls.map((c) => c.sql.match(/FOR (UPDATE|SHARE)/)?.[0])).toEqual([
        'FOR UPDATE',
        'FOR SHARE',
      ]);
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.enrollment.create',
        entityType: 'Enrollment',
        entityId: 'enr-n',
      });
    });

    it('404 estudiante inexistente; 422 si no es STUDENT o está WITHDRAWN', async () => {
      await expect(service.enroll('zz', { sectionId: 's3a' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      db.raw.users.set('doc1', { id: 'doc1', role: 'TEACHER', status: 'ACTIVE' });
      await expect(service.enroll('doc1', { sectionId: 's3a' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'WITHDRAWN' });
      await expect(service.enroll('est1', { sectionId: 's3a' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('INACTIVE sí se puede matricular', async () => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'INACTIVE' });
      await expect(service.enroll('est1', { sectionId: 's3a' }, actor)).resolves.toMatchObject({
        id: 'enr-n',
      });
    });

    it('409 si ya tiene una vigente en el año', async () => {
      db.prisma.enrollment.findFirst.mockResolvedValue({ id: 'enr-1' });
      await expect(service.enroll('est1', { sectionId: 's3a' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.prisma.enrollment.create).not.toHaveBeenCalled();
    });
  });

  describe('transfer (RF-24)', () => {
    const FROM = new Date('2026-03-01T00:00:00.000Z');

    beforeEach(() => {
      db.prisma.section.findUnique.mockResolvedValue(section('s3b', 3));
      db.prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enr-old',
        sectionId: 's3a',
        effectiveFrom: FROM,
        section: { gradeLevel: 3 },
      });
      db.prisma.enrollment.updateMany.mockResolvedValue({ count: 1 });
      db.prisma.enrollment.create.mockResolvedValue(
        enrollmentRow('enr-new', 's3b', { effectiveFrom: NOW }),
      );
      db.prisma.enrollment.findUniqueOrThrow.mockResolvedValue(
        enrollmentRow('enr-old', 's3a', {
          isCurrent: null,
          effectiveTo: NOW,
          endReason: 'TRANSFER',
        }),
      );
    });

    it('cierra con NULL + effectiveTo + TRANSFER y abre la nueva desde el mismo instante', async () => {
      const result = await service.transfer(
        'est1',
        { sectionId: 's3b', reason: 'Pedido de la familia' },
        actor,
      );
      expect(db.prisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 'enr-old', isCurrent: true },
        data: { isCurrent: null, effectiveTo: NOW, endReason: 'TRANSFER' },
      });
      expect(db.prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            studentId: 'est1',
            sectionId: 's3b',
            academicYearId: YEAR_2026,
            effectiveFrom: NOW,
          },
        }),
      );
      expect(result.closed).toMatchObject({
        id: 'enr-old',
        isCurrent: false,
        endReason: 'TRANSFER',
      });
      expect(result.current).toMatchObject({ id: 'enr-new', isCurrent: true });
      expect(order).toEqual(['audit:users.enrollment.transfer', 'event:enrollment.transferred.v1']);
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        entityType: 'Enrollment',
        entityId: 'enr-new',
        beforeState: { enrollmentId: 'enr-old', sectionId: 's3a' },
        afterState: {
          enrollmentId: 'enr-new',
          sectionId: 's3b',
          endReason: 'TRANSFER',
          reason: 'Pedido de la familia',
        },
      });
      expect(published[0].payload).toEqual({
        studentId: 'est1',
        academicYearId: YEAR_2026,
        fromEnrollmentId: 'enr-old',
        toEnrollmentId: 'enr-new',
        fromSectionId: 's3a',
        toSectionId: 's3b',
        transferredAt: NOW.toISOString(),
      });
    });

    it('at = max(now, effectiveFrom) si la vigente empieza en el futuro', async () => {
      const future = new Date('2026-11-01T00:00:00.000Z');
      db.prisma.enrollment.findFirst.mockResolvedValue({
        id: 'enr-old',
        sectionId: 's3a',
        effectiveFrom: future,
        section: { gradeLevel: 3 },
      });
      await service.transfer('est1', { sectionId: 's3b' }, actor);
      expect(db.prisma.enrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveTo: future }) }),
      );
      expect(db.prisma.enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveFrom: future }) }),
      );
    });

    it('409 sin vigente; 422 misma sección; 422 otro grado', async () => {
      db.prisma.enrollment.findFirst.mockResolvedValueOnce(null);
      await expect(service.transfer('est1', { sectionId: 's3b' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      db.prisma.section.findUnique.mockResolvedValueOnce(section('s3a', 3));
      await expect(service.transfer('est1', { sectionId: 's3a' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      db.prisma.section.findUnique.mockResolvedValueOnce(section('s4a', 4));
      await expect(service.transfer('est1', { sectionId: 's4a' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(db.prisma.enrollment.updateMany).not.toHaveBeenCalled();
    });

    it('409 si otra petición cerró la vigente (count 0) y no se crea la nueva', async () => {
      db.prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.transfer('est1', { sectionId: 's3b' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.prisma.enrollment.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(published).toEqual([]);
    });

    it('422 si el destino es de otro año (con año activo)', async () => {
      db.raw.years.set('y-2027', { id: 'y-2027', active: 0, open: 1 });
      db.prisma.section.findUnique.mockResolvedValue(
        section('s3a-27', 3, { academicYearId: 'y-2027' }),
      );
      db.prisma.academicYear.findFirst.mockResolvedValue({ id: YEAR_2026 });
      await expect(service.transfer('est1', { sectionId: 's3a-27' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('listForStudent', () => {
    it('404 si no existe y 422 si no es STUDENT', async () => {
      db.prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.listForStudent('zz', {})).rejects.toBeInstanceOf(NotFoundException);
      db.prisma.user.findUnique.mockResolvedValueOnce({ role: 'TEACHER' });
      await expect(service.listForStudent('doc1', {})).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('historial por effectiveFrom, filtrado por año', async () => {
      db.prisma.user.findUnique.mockResolvedValueOnce({ role: 'STUDENT' });
      db.prisma.enrollment.findMany.mockResolvedValue([
        enrollmentRow('a', 's3a', { isCurrent: null, effectiveTo: NOW, endReason: 'TRANSFER' }),
        enrollmentRow('b', 's3b'),
      ]);
      const result = await service.listForStudent('est1', { academicYearId: YEAR_2026 });
      expect(db.prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: 'est1', academicYearId: YEAR_2026 } }),
      );
      expect(result.total).toBe(2);
      expect(result.items.map((e) => e.isCurrent)).toEqual([false, true]);
    });
  });
});
