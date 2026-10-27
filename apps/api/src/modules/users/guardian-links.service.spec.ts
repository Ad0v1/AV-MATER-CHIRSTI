import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import { GuardianLinksService } from './guardian-links.service.js';
import { actor, makePrisma, prismaError, userRow } from './users-prisma.mock-spec.js';

const NOW = new Date('2026-10-26T15:00:00.000Z');
const CREATED = new Date('2026-03-01T00:00:00.000Z');
const person = (id: string) => ({ id, fullName: `Persona ${id}`, status: 'ACTIVE' as const });
const linkRow = (id: string, guardianId: string, studentId: string, active = true) => ({
  id,
  guardianId,
  studentId,
  isActive: active ? true : null,
  createdAt: CREATED,
  revokedAt: active ? null : NOW,
  guardian: person(guardianId),
  student: person(studentId),
});

describe('GuardianLinksService', () => {
  let db: ReturnType<typeof makePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: GuardianLinksService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = makePrisma();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new GuardianLinksService(
      db.asService,
      audit as unknown as AuditService,
      'colegio.example',
    );
    db.raw.users.set('apo1', { id: 'apo1', role: 'GUARDIAN', status: 'ACTIVE' });
    db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
    db.raw.users.set('est2', { id: 'est2', role: 'STUDENT', status: 'INACTIVE' });
    db.raw.users.set('est9', { id: 'est9', role: 'STUDENT', status: 'WITHDRAWN' });
    db.raw.users.set('doc1', { id: 'doc1', role: 'TEACHER', status: 'ACTIVE' });
  });
  afterEach(() => vi.useRealTimers());

  describe('createGuardian (RF-20)', () => {
    const dto = {
      institutionalEmail: 'padre@correo.example', // exento de dominio hasta D-013
      fullName: 'Padre Ficticio',
      studentIds: ['est2', 'est1'],
    };

    beforeEach(() => {
      db.prisma.user.findUnique.mockResolvedValue(null);
      db.prisma.user.create.mockResolvedValue(userRow('apoN', 'GUARDIAN'));
      db.prisma.guardianStudent.create.mockImplementation(
        ({ data }: { data: { guardianId: string; studentId: string } }) =>
          Promise.resolve(linkRow(`l-${data.studentId}`, data.guardianId, data.studentId)),
      );
    });

    it('crea apoderado y vínculos en una transacción; bloquea estudiantes en orden de id', async () => {
      const result = await service.createGuardian(dto, actor);
      expect(db.rawCalls.map((c) => c.values[0])).toEqual(['est1', 'est2']);
      expect(result.links.map((l) => l.student.id)).toEqual(['est2', 'est1']);
      expect(audit.record.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual([
        'users.user.create',
        'users.guardian_link.create',
        'users.guardian_link.create',
      ]);
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('correo.example');
    });

    it('422 si algún estudiante no existe, no es STUDENT o está WITHDRAWN', async () => {
      for (const bad of ['zz', 'doc1', 'est9']) {
        await expect(
          service.createGuardian({ ...dto, studentIds: ['est1', bad] }, actor),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      }
      expect(db.prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('link', () => {
    beforeEach(() => {
      db.prisma.guardianStudent.findFirst.mockResolvedValue(null);
      db.prisma.guardianStudent.create.mockResolvedValue(linkRow('l1', 'apo1', 'est1'));
    });

    it('crea un vínculo vigente', async () => {
      const view = await service.link('apo1', { studentId: 'est1' }, actor);
      expect(view).toMatchObject({ id: 'l1', isActive: true, revokedAt: null });
      expect(db.prisma.guardianStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { guardianId: 'apo1', studentId: 'est1' } }),
      );
    });

    it('422 mismo id; 404 inexistentes; 422 roles; 422 WITHDRAWN', async () => {
      await expect(service.link('apo1', { studentId: 'apo1' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(service.link('zz', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.link('apo1', { studentId: 'zz' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.link('doc1', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(service.link('apo1', { studentId: 'doc1' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(service.link('apo1', { studentId: 'est9' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      db.raw.users.set('apo1', { id: 'apo1', role: 'GUARDIAN', status: 'WITHDRAWN' });
      await expect(service.link('apo1', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(db.prisma.guardianStudent.create).not.toHaveBeenCalled();
    });

    it('409 si ya hay uno vigente (o P2002 en la carrera)', async () => {
      db.prisma.guardianStudent.findFirst.mockResolvedValueOnce({ id: 'l0' });
      await expect(service.link('apo1', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      db.prisma.guardianStudent.create.mockRejectedValue(prismaError('P2002'));
      await expect(service.link('apo1', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('revoke (RN-13)', () => {
    const reason = { reason: 'Cambio de tutor legal' };

    it('escribe isActive NULL + revokedAt (nunca false) y el motivo solo en la bitácora', async () => {
      db.prisma.guardianStudent.findUnique.mockResolvedValue({
        id: 'l1',
        isActive: true,
        createdAt: CREATED,
      });
      db.prisma.guardianStudent.updateMany.mockResolvedValue({ count: 1 });
      db.prisma.guardianStudent.findUniqueOrThrow.mockResolvedValue(
        linkRow('l1', 'apo1', 'est1', false),
      );
      const view = await service.revoke('l1', reason, actor);
      expect(db.prisma.guardianStudent.updateMany).toHaveBeenCalledWith({
        where: { id: 'l1', isActive: true },
        data: { isActive: null, revokedAt: NOW },
      });
      expect(view).toMatchObject({ isActive: false, revokedAt: NOW.toISOString() });
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.guardian_link.revoke',
        entityType: 'GuardianStudent',
        entityId: 'l1',
        beforeState: { isActive: true },
        afterState: { isActive: false, reason: reason.reason },
      });
    });

    it('404 si no existe; 409 si ya está revocado o lo revocó otra petición', async () => {
      db.prisma.guardianStudent.findUnique.mockResolvedValueOnce(null);
      await expect(service.revoke('zz', reason, actor)).rejects.toBeInstanceOf(NotFoundException);
      db.prisma.guardianStudent.findUnique.mockResolvedValueOnce({
        id: 'l1',
        isActive: null,
        createdAt: CREATED,
      });
      await expect(service.revoke('l1', reason, actor)).rejects.toBeInstanceOf(ConflictException);
      db.prisma.guardianStudent.findUnique.mockResolvedValueOnce({
        id: 'l1',
        isActive: true,
        createdAt: CREATED,
      });
      db.prisma.guardianStudent.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('l1', reason, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('listados', () => {
    it('solo vigentes por defecto; includeRevoked trae todos', async () => {
      db.prisma.user.findUnique.mockResolvedValue({ role: 'GUARDIAN' });
      db.prisma.guardianStudent.findMany.mockResolvedValue([]);
      await service.listForGuardian('apo1', { includeRevoked: false });
      expect(db.prisma.guardianStudent.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { guardianId: 'apo1', isActive: true } }),
      );
      await service.listForGuardian('apo1', { includeRevoked: true });
      expect(db.prisma.guardianStudent.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { guardianId: 'apo1' } }),
      );
    });

    it('404 si no existe; 422 si el rol no corresponde', async () => {
      db.prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.listForStudent('zz', { includeRevoked: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      db.prisma.user.findUnique.mockResolvedValueOnce({ role: 'GUARDIAN' });
      await expect(
        service.listForStudent('apo1', { includeRevoked: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
