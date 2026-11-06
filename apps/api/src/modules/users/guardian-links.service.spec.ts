import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import { GuardianLinksService } from './guardian-links.service.js';
import { actor, makeIssuer, makePrisma, prismaError } from './users-prisma.mock-spec.js';

const NOW = new Date('2026-10-26T15:00:00.000Z');
const CREATED = new Date('2026-03-01T00:00:00.000Z');
const person = (id: string) => ({ id, fullName: `Persona ${id}`, status: 'ACTIVE' as const });
const linkRow = (id: string, guardianId: string, studentId: string, active = true) => ({
  id,
  guardianId,
  studentId,
  isActive: active ? true : null,
  isPrimary: active ? true : null,
  createdAt: CREATED,
  revokedAt: active ? null : NOW,
  guardian: person(guardianId),
  student: person(studentId),
});

describe('GuardianLinksService', () => {
  let db: ReturnType<typeof makePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: GuardianLinksService;
  let issuer: ReturnType<typeof makeIssuer>['issuer'];
  let asIssuer: ReturnType<typeof makeIssuer>['asIssuer'];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    db = makePrisma();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    ({ issuer, asIssuer } = makeIssuer());
    service = new GuardianLinksService(
      db.asService,
      audit as unknown as AuditService,
      asIssuer,
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
      fullName: 'Padre Ficticio',
      dni: '11111111',
      dniConfirm: '11111111',
      studentIds: ['est2', 'est1'],
    };

    beforeEach(() => {
      db.prisma.user.findUnique.mockResolvedValue(null);
      db.prisma.guardianStudent.count.mockResolvedValue(0);
      db.prisma.guardianStudent.create.mockImplementation(
        ({ data }: { data: { guardianId: string; studentId: string } }) =>
          Promise.resolve(linkRow(`l-${data.studentId}`, data.guardianId, data.studentId)),
      );
    });

    it('crea apoderado y vínculos en una transacción; bloquea estudiantes en orden de id', async () => {
      const result = await service.createGuardian(dto, actor);
      expect(db.rawCalls.map((c) => c.values[0])).toEqual(['est1', 'est2']);
      expect(result.links.map((l) => l.student.id)).toEqual(['est2', 'est1']);
      expect(result.credentials).toEqual({
        code: '2600000000',
        initialPassword: 'Clave-Inicial-9',
      });
      expect(audit.record.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual([
        'users.user.create',
        'users.guardian_link.create',
        'users.guardian_link.create',
      ]);
      const text = JSON.stringify(audit.record.mock.calls);
      for (const secret of ['11111111', '2600000000', 'Clave-Inicial-9']) {
        expect(text).not.toContain(secret);
      }
    });

    it('el vínculo es el principal solo si el alumno no tenía otro apoderado', async () => {
      db.prisma.guardianStudent.count.mockResolvedValue(0);
      await service.createGuardian({ ...dto, studentIds: ['est1'] }, actor);
      expect(db.prisma.guardianStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
      );
    });

    it('409 si algún alumno ya tiene 2 apoderados vigentes', async () => {
      db.prisma.guardianStudent.count.mockResolvedValue(2);
      await expect(service.createGuardian(dto, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(issuer.createUser).not.toHaveBeenCalled();
    });

    it('422 si algún estudiante no existe, no es STUDENT o está WITHDRAWN', async () => {
      for (const bad of ['zz', 'doc1', 'est9']) {
        await expect(
          service.createGuardian({ ...dto, studentIds: ['est1', bad] }, actor),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      }
      expect(issuer.createUser).not.toHaveBeenCalled();
    });

    it('P2002 en la carrera del DNI → 409', async () => {
      issuer.createUser.mockRejectedValueOnce(prismaError('P2002'));
      await expect(service.createGuardian(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('link', () => {
    beforeEach(() => {
      db.prisma.guardianStudent.findFirst.mockResolvedValue(null);
      db.prisma.guardianStudent.count.mockResolvedValue(0);
      db.prisma.guardianStudent.create.mockResolvedValue(linkRow('l1', 'apo1', 'est1'));
    });

    it('crea un vínculo vigente; el primero del alumno es el principal', async () => {
      const view = await service.link('apo1', { studentId: 'est1' }, actor);
      expect(view).toMatchObject({ id: 'l1', isActive: true, isPrimary: true, revokedAt: null });
      expect(db.prisma.guardianStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { guardianId: 'apo1', studentId: 'est1', isPrimary: true },
        }),
      );
    });

    it('el segundo apoderado no es el principal', async () => {
      db.prisma.guardianStudent.count.mockResolvedValue(1);
      await service.link('apo1', { studentId: 'est1' }, actor);
      expect(db.prisma.guardianStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { guardianId: 'apo1', studentId: 'est1', isPrimary: null },
        }),
      );
    });

    it('409 si el alumno ya tiene 2 apoderados vigentes', async () => {
      db.prisma.guardianStudent.count.mockResolvedValue(2);
      await expect(service.link('apo1', { studentId: 'est1' }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.prisma.guardianStudent.create).not.toHaveBeenCalled();
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

  describe('revoke (RN-13, RN-17)', () => {
    const reason = { reason: 'Cambio de tutor legal' };

    // Primera lectura: el vínculo (para saber el alumno); segunda: dentro de la transacción.
    const arrange = (
      link: { isActive: boolean | null; isPrimary: boolean | null },
      others: Array<{ id: string }>,
      studentId = 'est1',
    ) => {
      db.prisma.guardianStudent.findUnique
        .mockResolvedValueOnce({ studentId })
        .mockResolvedValueOnce({ id: 'l1', createdAt: CREATED, ...link });
      db.prisma.guardianStudent.findMany.mockResolvedValue(others);
      db.prisma.guardianStudent.updateMany.mockResolvedValue({ count: 1 });
      db.prisma.guardianStudent.update.mockResolvedValue({});
      db.prisma.guardianStudent.findUniqueOrThrow.mockResolvedValue(
        linkRow('l1', 'apo1', studentId, false),
      );
    };

    it('escribe isActive y isPrimary NULL + revokedAt (nunca false) y el motivo solo en la bitácora', async () => {
      arrange({ isActive: true, isPrimary: false }, [{ id: 'l2' }]);
      const view = await service.revoke('l1', reason, actor);
      expect(db.prisma.guardianStudent.updateMany).toHaveBeenCalledWith({
        where: { id: 'l1', isActive: true },
        data: { isActive: null, isPrimary: null, revokedAt: NOW },
      });
      expect(db.prisma.guardianStudent.update).not.toHaveBeenCalled();
      expect(view).toMatchObject({ isActive: false, revokedAt: NOW.toISOString() });
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.guardian_link.revoke',
        entityType: 'GuardianStudent',
        entityId: 'l1',
        beforeState: { isActive: true },
        afterState: { isActive: false, reason: reason.reason },
      });
    });

    it('si era el principal, el otro apoderado vigente pasa a serlo', async () => {
      arrange({ isActive: true, isPrimary: true }, [{ id: 'l2' }]);
      await service.revoke('l1', reason, actor);
      expect(db.prisma.guardianStudent.update).toHaveBeenCalledWith({
        where: { id: 'l2' },
        data: { isPrimary: true },
      });
      expect(audit.record.mock.calls.map((c) => (c[0] as { action: string }).action)).toEqual([
        'users.guardian_link.revoke',
        'users.guardian_link.make_primary',
      ]);
    });

    it('409 si es el último apoderado de un alumno que sigue en el colegio', async () => {
      arrange({ isActive: true, isPrimary: true }, []);
      await expect(service.revoke('l1', reason, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.guardianStudent.updateMany).not.toHaveBeenCalled();
    });

    it('permite revocar al último apoderado de un alumno retirado', async () => {
      arrange({ isActive: true, isPrimary: true }, [], 'est9');
      await service.revoke('l1', reason, actor);
      expect(db.prisma.guardianStudent.updateMany).toHaveBeenCalled();
    });

    it('404 si no existe; 409 si ya está revocado o lo revocó otra petición', async () => {
      db.prisma.guardianStudent.findUnique.mockResolvedValueOnce(null);
      await expect(service.revoke('zz', reason, actor)).rejects.toBeInstanceOf(NotFoundException);

      arrange({ isActive: null, isPrimary: null }, []);
      await expect(service.revoke('l1', reason, actor)).rejects.toBeInstanceOf(ConflictException);

      arrange({ isActive: true, isPrimary: false }, [{ id: 'l2' }]);
      db.prisma.guardianStudent.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('l1', reason, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('makePrimary (RF-86)', () => {
    const arrange = (link: { isActive: boolean | null; isPrimary: boolean | null }) => {
      db.prisma.guardianStudent.findUnique
        .mockResolvedValueOnce({ studentId: 'est1' })
        .mockResolvedValueOnce(link);
      db.prisma.guardianStudent.updateMany.mockResolvedValue({ count: 1 });
      db.prisma.guardianStudent.update.mockResolvedValue({});
      db.prisma.guardianStudent.findUniqueOrThrow.mockResolvedValue(linkRow('l2', 'apo1', 'est1'));
    };

    it('quita la marca al principal anterior y se la pone a este vínculo, en ese orden', async () => {
      arrange({ isActive: true, isPrimary: false });
      await service.makePrimary('l2', actor);
      const order = [
        db.prisma.guardianStudent.updateMany.mock.invocationCallOrder[0]!,
        db.prisma.guardianStudent.update.mock.invocationCallOrder[0]!,
      ];
      expect(order[0]).toBeLessThan(order[1]!);
      expect(db.prisma.guardianStudent.updateMany).toHaveBeenCalledWith({
        where: { studentId: 'est1', isActive: true, isPrimary: true },
        data: { isPrimary: null },
      });
      expect(db.prisma.guardianStudent.update).toHaveBeenCalledWith({
        where: { id: 'l2' },
        data: { isPrimary: true },
      });
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.guardian_link.make_primary',
        entityId: 'l2',
      });
    });

    it('si ya es el principal no escribe ni registra', async () => {
      arrange({ isActive: true, isPrimary: true });
      await service.makePrimary('l2', actor);
      expect(db.prisma.guardianStudent.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('404 si no existe y 409 si el vínculo está revocado', async () => {
      db.prisma.guardianStudent.findUnique.mockResolvedValueOnce(null);
      await expect(service.makePrimary('zz', actor)).rejects.toBeInstanceOf(NotFoundException);
      arrange({ isActive: null, isPrimary: null });
      await expect(service.makePrimary('l2', actor)).rejects.toBeInstanceOf(ConflictException);
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
