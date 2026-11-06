import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { SessionService } from '../../common/session/session.service.js';
import type { LoginAttemptsService } from '../auth/login-attempts.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { AcademicEventPublisher } from '../academic/academic-events.js';
import {
  actor,
  enrollmentRow,
  makeIssuer,
  makePrisma,
  prismaError,
  userRow,
  YEAR_2025,
  YEAR_2026,
} from './users-prisma.mock-spec.js';
import { SEARCH_IDS_LIMIT, UsersService } from './users.service.js';

describe('UsersService', () => {
  let db: ReturnType<typeof makePrisma>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let events: AcademicEventPublisher;
  let published: string[];
  let order: string[];
  let service: UsersService;
  let issuer: ReturnType<typeof makeIssuer>['issuer'];
  let asIssuer: ReturnType<typeof makeIssuer>['asIssuer'];
  let sessions: { revokeAll: ReturnType<typeof vi.fn> };
  let attempts: { isLocked: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = makePrisma();
    order = [];
    audit = {
      record: vi.fn((e: { action: string }) => {
        order.push(`audit:${e.action}`);
        return Promise.resolve();
      }),
    };
    events = new AcademicEventPublisher();
    published = [];
    events.on('user.status-changed.v1', (e) => {
      published.push(e.type);
      order.push(`event:${e.type}`);
    });
    const access = {
      getActiveYear: vi.fn().mockResolvedValue({ id: YEAR_2026, year: 2026 }),
    } as unknown as AcademicAccessService;
    ({ issuer, asIssuer } = makeIssuer());
    sessions = { revokeAll: vi.fn().mockResolvedValue(undefined) };
    attempts = {
      isLocked: vi.fn().mockResolvedValue(false),
      unlock: vi.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      db.asService,
      audit as unknown as AuditService,
      access,
      events,
      asIssuer,
      sessions as unknown as SessionService,
      attempts as unknown as LoginAttemptsService,
      'colegio.example',
    );
  });

  describe('list (RF-25)', () => {
    it('busca el texto con LOCATE (parámetro literal, sin comodines) y pagina', async () => {
      db.raw.searchIds = ['e1'];
      db.prisma.user.count.mockResolvedValue(1);
      db.prisma.user.findMany.mockResolvedValue([
        {
          id: 'e1',
          code: '2600000000',
          institutionalEmail: 'e1@x',
          contactEmail: null,
          emailVerifiedAt: null,
          dniVerifiedAt: null,
          fullName: 'E',
          role: 'STUDENT',
          status: 'ACTIVE',
          localCredential: { mustChangePassword: true },
        },
      ]);
      db.prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 'e1', section: { id: 's3a', gradeLevel: 3, code: 'A' } },
      ]);

      const page = await service.list({ q: '%_', page: 2, pageSize: 10 });

      const search = db.rawCalls.find((c) => c.sql.includes('LOCATE'));
      expect(search?.values).toEqual(['%_', '%_', '%_', '%_', SEARCH_IDS_LIMIT]);
      expect(search?.sql).toMatch(/ORDER BY id LIMIT \?$/);
      expect(SEARCH_IDS_LIMIT).toBe(5000);
      expect(db.prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['e1'] } },
          skip: 10,
          take: 10,
          orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(page).toEqual({
        items: [
          {
            id: 'e1',
            code: '2600000000',
            institutionalEmail: 'e1@x',
            contactEmail: null,
            emailVerified: false,
            dniVerified: false,
            fullName: 'E',
            role: 'STUDENT',
            status: 'ACTIVE',
            currentSection: { id: 's3a', gradeLevel: 3, code: 'A' },
            credentialStatus: 'PENDING',
            locked: false,
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      });
    });

    it('grado en el año activo por defecto', async () => {
      db.prisma.user.count.mockResolvedValue(0);
      db.prisma.user.findMany.mockResolvedValue([]);
      await service.list({ role: 'STUDENT', gradeLevel: 3, page: 1, pageSize: 20 });
      expect(db.prisma.user.count).toHaveBeenCalledWith({
        where: {
          role: 'STUDENT',
          enrollments: {
            some: { academicYearId: YEAR_2026, isCurrent: true, section: { gradeLevel: 3 } },
          },
        },
      });
    });
  });

  describe('update (RF-22)', () => {
    beforeEach(() => db.prisma.user.findUnique.mockResolvedValueOnce(userRow('t1', 'TEACHER')));

    it('sin cambios → 200 sin escribir ni registrar', async () => {
      const view = await service.update('t1', { fullName: 'Usuario Ficticio t1' }, actor);
      expect(view.id).toBe('t1');
      expect(db.prisma.user.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('registra solo los nombres de los campos cambiados (sin valores)', async () => {
      db.prisma.user.findUnique.mockResolvedValueOnce(null); // correo libre
      db.prisma.user.update.mockResolvedValue({
        ...userRow('t1', 'TEACHER'),
        fullName: 'Nuevo Nombre',
        institutionalEmail: 'nuevo@colegio.example',
      });
      await service.update(
        't1',
        { fullName: 'Nuevo Nombre', institutionalEmail: 'nuevo@colegio.example' },
        actor,
      );
      const event = audit.record.mock.calls[0][0];
      expect(event).toMatchObject({
        module: 'users',
        action: 'users.user.update',
        entityType: 'User',
        entityId: 't1',
        afterState: { changedFields: ['fullName', 'institutionalEmail'] },
      });
      expect(JSON.stringify(event)).not.toContain('nuevo@');
      expect(JSON.stringify(event)).not.toContain('Nuevo Nombre');
    });

    it('422 si el correo nuevo no es del dominio institucional', async () => {
      await expect(
        service.update('t1', { institutionalEmail: 'x@otro.example' }, actor),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('409 si el correo ya es de otro usuario (también por P2002)', async () => {
      db.prisma.user.findUnique.mockResolvedValueOnce({ id: 'otro' });
      await expect(
        service.update('t1', { institutionalEmail: 'admin@colegio.example' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);

      db.prisma.user.findUnique
        .mockResolvedValueOnce(userRow('t1', 'TEACHER'))
        .mockResolvedValueOnce(null);
      db.prisma.user.update.mockRejectedValue(prismaError('P2002'));
      await expect(
        service.update('t1', { institutionalEmail: 'carrera@colegio.example' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 si no existe', async () => {
      db.prisma.user.findUnique.mockReset().mockResolvedValue(null);
      await expect(service.update('zz', { fullName: 'Ana Pérez' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('changeStatus (RF-23)', () => {
    const NOW = new Date('2026-10-26T15:00:00.000Z');
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      db.prisma.user.findUniqueOrThrow.mockResolvedValue(userRow('est1', 'STUDENT', 'WITHDRAWN'));
    });
    afterEach(() => vi.useRealTimers());

    it('409 sobre sí mismo, sin abrir transacción', async () => {
      await expect(
        service.changeStatus('adm1', { status: 'INACTIVE' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('mismo estado → 200 sin bitácora ni evento', async () => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'WITHDRAWN' });
      const result = await service.changeStatus('est1', { status: 'WITHDRAWN' }, actor);
      expect(result.closedEnrollments).toEqual([]);
      expect(db.prisma.user.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(published).toEqual([]);
    });

    it('404 si el usuario no existe', async () => {
      await expect(
        service.changeStatus('zz', { status: 'INACTIVE' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('STUDENT → WITHDRAWN cierra las vigentes de años abiertos con NULL, fecha y WITHDRAWAL', async () => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
      db.raw.years.set(YEAR_2025, { id: YEAR_2025, active: 0, open: 0 });
      db.raw.years.set(YEAR_2026, { id: YEAR_2026, active: 1, open: 1 });
      db.prisma.enrollment.findMany
        .mockResolvedValueOnce([
          { id: 'enr-2025', academicYearId: YEAR_2025, effectiveFrom: new Date('2025-03-01') },
          { id: 'enr-2026', academicYearId: YEAR_2026, effectiveFrom: new Date('2026-03-01') },
        ])
        .mockResolvedValueOnce([
          enrollmentRow('enr-2026', 's3a', {
            isCurrent: null,
            effectiveTo: NOW,
            endReason: 'WITHDRAWAL',
          }),
        ]);
      db.prisma.enrollment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.changeStatus(
        'est1',
        { status: 'WITHDRAWN', reason: 'Traslado a otro colegio' },
        actor,
      );

      // Orden: rol sin bloqueo → User FOR UPDATE → AcademicYear FOR SHARE (no es ADMIN).
      const locks = db.rawCalls.map((c) => (c.sql.includes('AcademicYear') ? 'year' : 'user'));
      expect(locks).toEqual(['user', 'user', 'year', 'year']);
      expect(db.rawCalls[0].sql).not.toContain('FOR');
      expect(db.rawCalls[1].sql).toContain('FOR UPDATE');
      expect(db.rawCalls[2].sql).toContain('FOR SHARE');
      expect(db.rawCalls.some((c) => c.sql.includes("role = 'ADMIN'"))).toBe(false);
      // Solo se cierra la del año abierto; nunca isCurrent false.
      expect(db.prisma.enrollment.updateMany).toHaveBeenCalledTimes(1);
      expect(db.prisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 'enr-2026', isCurrent: true },
        data: { isCurrent: null, effectiveTo: NOW, endReason: 'WITHDRAWAL' },
      });
      expect(db.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'est1' },
        data: { status: 'WITHDRAWN' },
      });
      expect(result.closedEnrollments.map((e) => e.id)).toEqual(['enr-2026']);
      // Bitácora antes que el evento.
      expect(order).toEqual([
        'audit:users.user.status_change',
        'audit:users.enrollment.withdraw',
        'event:user.status-changed.v1',
      ]);
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        beforeState: { status: 'ACTIVE' },
        afterState: { status: 'WITHDRAWN', reason: 'Traslado a otro colegio' },
      });
    });

    it('publica user.status-changed.v1 con las matrículas cerradas', async () => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
      db.prisma.user.findUniqueOrThrow.mockResolvedValue(userRow('est1', 'STUDENT', 'INACTIVE'));
      const payloads: unknown[] = [];
      events.on('user.status-changed.v1', (e) => {
        payloads.push(e.payload);
      });
      await service.changeStatus('est1', { status: 'INACTIVE' }, actor);
      // INACTIVE no toca la matrícula.
      expect(db.prisma.enrollment.findMany).not.toHaveBeenCalled();
      expect(payloads).toEqual([
        {
          userId: 'est1',
          role: 'STUDENT',
          previousStatus: 'ACTIVE',
          status: 'INACTIVE',
          changedAt: NOW.toISOString(),
          closedEnrollmentIds: [],
        },
      ]);
    });

    it('409 si la vigente cambió entretanto (updateMany count 0)', async () => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
      db.raw.years.set(YEAR_2026, { id: YEAR_2026, active: 1, open: 1 });
      db.prisma.enrollment.findMany.mockResolvedValueOnce([
        { id: 'enr-2026', academicYearId: YEAR_2026, effectiveFrom: new Date('2026-03-01') },
      ]);
      db.prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.changeStatus('est1', { status: 'WITHDRAWN' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('409 si deja el sistema sin ADMIN activo', async () => {
      db.raw.users.set('adm2', { id: 'adm2', role: 'ADMIN', status: 'ACTIVE' });
      db.raw.activeAdmins = ['adm2'];
      await expect(
        service.changeStatus('adm2', { status: 'INACTIVE' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.user.update).not.toHaveBeenCalled();
    });

    it('objetivo ADMIN: bloquea primero los ADMIN activos y después el objetivo', async () => {
      db.raw.users.set('adm2', { id: 'adm2', role: 'ADMIN', status: 'ACTIVE' });
      db.raw.activeAdmins = ['adm1', 'adm2'];
      db.prisma.user.findUniqueOrThrow.mockResolvedValue(userRow('adm2', 'ADMIN', 'INACTIVE'));
      await service.changeStatus('adm2', { status: 'INACTIVE' }, actor);
      const kinds = db.rawCalls.map((c) =>
        c.sql.includes("role = 'ADMIN'")
          ? 'admins'
          : c.sql.includes('FOR UPDATE')
            ? 'target'
            : 'role',
      );
      expect(kinds).toEqual(['role', 'admins', 'target']);
      expect(db.rawCalls[1].sql).toContain('ORDER BY id FOR UPDATE');
      expect(db.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'adm2' },
        data: { status: 'INACTIVE' },
      });
    });

    it('deadlock 1213 de un $queryRaw (P2010) → 409 sin bitácora ni evento', async () => {
      db.raw.users.set('adm2', { id: 'adm2', role: 'ADMIN', status: 'ACTIVE' });
      const deadlock = Object.assign(new Error('Raw query failed. Code: `1213`'), {
        code: 'P2010',
        meta: {
          driverAdapterError: {
            cause: { originalCode: '1213', kind: 'TransactionWriteConflict' },
          },
        },
      });
      db.prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) =>
        strings.join('?').includes("role = 'ADMIN'")
          ? Promise.reject(deadlock)
          : Promise.resolve([{ id: 'adm2', role: 'ADMIN', status: 'ACTIVE' }]),
      );
      await expect(
        service.changeStatus('adm2', { status: 'INACTIVE' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.user.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(published).toEqual([]);
    });

    it('P2034 (bloqueo mutuo) → 409', async () => {
      db.raw.users.set('adm2', { id: 'adm2', role: 'ADMIN', status: 'ACTIVE' });
      db.raw.activeAdmins = ['adm1', 'adm2'];
      db.prisma.user.update.mockRejectedValue(prismaError('P2034'));
      await expect(
        service.changeStatus('adm2', { status: 'INACTIVE' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createTeacher (RF-19)', () => {
    const dto = { fullName: 'Docente Nuevo', dni: '45678901', dniConfirm: '45678901' };

    it('crea TEACHER con sus credenciales y registra solo rol y estado', async () => {
      issuer.createUser.mockResolvedValueOnce({
        user: userRow('t9', 'TEACHER'),
        credentials: { code: '2600000009', initialPassword: 'Clave-Inicial-9' },
      });
      const result = await service.createTeacher(dto, actor);
      expect(result.user.role).toBe('TEACHER');
      expect(result.credentials).toEqual({
        code: '2600000009',
        initialPassword: 'Clave-Inicial-9',
      });
      expect(issuer.createUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'TEACHER', dni: '45678901', fullName: 'Docente Nuevo' }),
      );
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.user.create',
        afterState: { role: 'TEACHER', status: 'ACTIVE' },
      });
      const text = JSON.stringify(audit.record.mock.calls);
      for (const secret of ['45678901', '2600000009', 'Clave-Inicial-9']) {
        expect(text).not.toContain(secret);
      }
    });

    it('con correo del colegio: 422 dominio y 409 correo repetido', async () => {
      await expect(
        service.createTeacher({ ...dto, institutionalEmail: 'x@otro.example' }, actor),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      db.prisma.user.findUnique.mockResolvedValue({ id: 'otro' });
      await expect(
        service.createTeacher({ ...dto, institutionalEmail: 'docente01@colegio.example' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('P2002 en la carrera → 409', async () => {
      issuer.createUser.mockRejectedValueOnce(prismaError('P2002'));
      await expect(service.createTeacher(dto, actor)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resetPassword (RF-74)', () => {
    beforeEach(() => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
      db.prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...userRow('est1', 'STUDENT'),
        code: '2600000001',
      });
    });

    it('emite una contraseña temporal, cierra las sesiones y levanta el bloqueo', async () => {
      issuer.reissue.mockResolvedValueOnce({
        code: '2600000001',
        initialPassword: 'Clave-Temporal-7',
        previousCode: '2600000001',
      });
      const result = await service.resetPassword('est1', actor);
      expect(result.credentials).toEqual({
        code: '2600000001',
        initialPassword: 'Clave-Temporal-7',
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith('est1');
      expect(attempts.unlock).toHaveBeenCalledWith('2600000001');
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.user.reset_password',
        entityId: 'est1',
      });
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('Clave-Temporal-7');
    });

    it('404 si el usuario no existe', async () => {
      await expect(service.resetPassword('zz', actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });
  });

  describe('correctDni (RF-84)', () => {
    const dto = {
      dni: '99999999',
      dniConfirm: '99999999',
      reason: 'Error de digitación al registrar',
    };

    beforeEach(() => {
      db.raw.users.set('est1', { id: 'est1', role: 'STUDENT', status: 'ACTIVE' });
      db.prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...userRow('est1', 'STUDENT'),
        code: '2600000002',
        dniHash: 'hash-45678901',
      });
    });

    it('genera código nuevo, cierra sesiones y deja el código anterior en la bitácora', async () => {
      issuer.reissue.mockResolvedValueOnce({
        code: '2600000002',
        initialPassword: 'Clave-Temporal-7',
        previousCode: '2600000001',
      });
      const result = await service.correctDni('est1', dto, actor);
      expect(issuer.reissue).toHaveBeenCalledWith(expect.anything(), 'est1', { newCode: true });
      expect(db.prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'est1' },
        data: { dniEncrypted: 'enc-99999999', dniHash: 'hash-99999999', dniVerifiedAt: null },
      });
      expect(result.credentials.code).toBe('2600000002');
      expect(sessions.revokeAll).toHaveBeenCalledWith('est1');
      expect(attempts.unlock).toHaveBeenCalledWith('2600000001');
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'users.user.correct_dni',
        beforeState: { code: '2600000001' },
        afterState: { code: '2600000002', reason: dto.reason },
      });
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('99999999');
    });

    it('409 si el DNI nuevo es igual al actual', async () => {
      await expect(
        service.correctDni('est1', { ...dto, dni: '45678901', dniConfirm: '45678901' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('409 si el DNI ya lo tiene otra persona', async () => {
      issuer.assertDniFree.mockRejectedValueOnce(new ConflictException('DNI'));
      await expect(service.correctDni('est1', dto, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
