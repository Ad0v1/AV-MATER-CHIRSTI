import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { AuditService } from '../../../common/audit/audit.service.js';
import type { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../../academic/academic-access.service.js';
import { sha256Of } from './import-file.js';
import { UserImportService } from './user-import.service.js';

const DOMAIN = 'colegio.example';
const YEAR = 'y-2026';
const mail = (u: string) => `${u}@${DOMAIN}`;
const actor = { id: 'adm1', ip: '127.0.0.1' };
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const csvFile = (text: string) => {
  const buffer = Buffer.from(text, 'utf8');
  return { originalname: 'Lista de 3A.csv', size: buffer.length, buffer };
};

type User = { id: string; institutionalEmail: string; role: string; status: string };

/** Prisma simulado: guarda el orden de las operaciones para comprobar el orden de bloqueos. */
function makeDb() {
  const order: string[] = [];
  const state = {
    users: [] as User[],
    sections: [
      { id: 's3a', academicYearId: YEAR, gradeLevel: 3, code: 'A', isActive: true },
      { id: 's3b', academicYearId: YEAR, gradeLevel: 3, code: 'B', isActive: false },
    ],
    year: { id: YEAR, active: 1, open: 1 } as { id: string; active: number; open: number } | null,
    closedAt: null as Date | null,
  };
  const inList = (list: string[] | undefined, v: string) => list === undefined || list.includes(v);
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('FROM AcademicYear')) {
        order.push('lock:year');
        return Promise.resolve(state.year ? [state.year] : []);
      }
      if (sql.includes('FROM User')) {
        order.push(`lock:user:${String(values[0])}`);
        const u = state.users.find((x) => x.id === values[0]);
        return Promise.resolve(u ? [{ id: u.id, role: u.role, status: u.status }] : []);
      }
      return Promise.reject(new Error(`SQL no simulado: ${sql}`));
    }),
    user: {
      findMany: vi.fn(
        (args: { where: { institutionalEmail: { in: string[] }; id?: { in: string[] } } }) => {
          order.push('read:users');
          return Promise.resolve(
            state.users.filter(
              (u) =>
                args.where.institutionalEmail.in.includes(u.institutionalEmail) &&
                inList(args.where.id?.in, u.id),
            ),
          );
        },
      ),
      createMany: vi.fn((args: { data: unknown[] }) => {
        order.push(`write:users:${args.data.length}`);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    section: {
      findMany: vi.fn(() => {
        order.push('read:sections');
        return Promise.resolve(state.sections);
      }),
    },
    academicYear: {
      findUnique: vi.fn(() => Promise.resolve({ closedAt: state.closedAt })),
    },
    enrollment: {
      createMany: vi.fn((args: { data: unknown[] }) => {
        order.push(`write:enrollments:${args.data.length}`);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    guardianStudent: {
      createMany: vi.fn((args: { data: unknown[] }) => {
        order.push(`write:links:${args.data.length}`);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => {
    order.push('tx');
    return cb(prisma);
  });
  return { prisma, state, order, asService: prisma as unknown as PrismaService };
}

describe('UserImportService (RF-21)', () => {
  let db: ReturnType<typeof makeDb>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let access: { getActiveYear: ReturnType<typeof vi.fn> };
  let service: UserImportService;

  beforeEach(() => {
    db = makeDb();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    access = { getActiveYear: vi.fn().mockResolvedValue({ id: YEAR, year: 2026 }) };
    service = new UserImportService(
      db.asService,
      audit as unknown as AuditService,
      access as unknown as AcademicAccessService,
      DOMAIN,
    );
  });

  const STUDENTS_OK = `correo,nombre_completo,grado,seccion\n${mail('qa1')},Ana Pérez,3,a\n${mail('qa2')},Luis Rojas,3,A\n`;

  describe('preview', () => {
    it('valida contra la BD sin escribir ni registrar bitácora', async () => {
      db.state.users.push({
        id: 'u1',
        institutionalEmail: mail('qa2'),
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      const file = csvFile(STUDENTS_OK);
      const report = await service.preview('students', file);
      expect(report).toMatchObject({
        type: 'students',
        format: 'csv',
        sha256: sha256Of(file.buffer),
        totalRows: 2,
        validRows: 1,
        errorRows: 1,
        errorsTruncated: false,
        summary: { users: 1, enrollments: 1, links: 0 },
        canConfirm: false,
      });
      expect(report.errors).toEqual([
        {
          row: 3,
          column: 'correo',
          code: 'EMAIL_TAKEN',
          message: 'Ya existe un usuario con ese correo',
        },
      ]);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
      expect(db.prisma.user.createMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('students sin año activo o con el año cerrado → 409; teachers no lo necesita', async () => {
      access.getActiveYear.mockResolvedValueOnce(null);
      await expect(service.preview('students', csvFile(STUDENTS_OK))).rejects.toThrow(
        ConflictException,
      );
      db.state.closedAt = new Date();
      await expect(service.preview('students', csvFile(STUDENTS_OK))).rejects.toThrow(
        'El año académico está cerrado',
      );
      access.getActiveYear.mockResolvedValue(null);
      const report = await service.preview(
        'teachers',
        csvFile(`correo,nombre_completo\n${mail('d1')},Ana Pérez\n`),
      );
      expect(report.canConfirm).toBe(true);
    });
  });

  describe('commit', () => {
    it('hash distinto → 409 sin abrir la transacción', async () => {
      await expect(
        service.commit('students', 'f'.repeat(64), csvFile(STUDENTS_OK), actor),
      ).rejects.toThrow(ConflictException);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('errores del archivo → 422 con details y sin escribir', async () => {
      const file = csvFile(`correo,nombre_completo\nno-es-correo,Ana Pérez\n`);
      const error = await service
        .commit('teachers', sha256Of(file.buffer), file, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: [
          { row: 2, column: 'correo', code: 'INVALID_EMAIL', message: 'El correo no es válido' },
        ],
      });
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('errores contra la BD dentro de la transacción → 422 sin escribir nada', async () => {
      db.state.sections[0].isActive = false;
      const file = csvFile(STUDENTS_OK);
      await expect(service.commit('students', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(db.order.some((o) => o.startsWith('write:'))).toBe(false);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('students: año FOR SHARE → secciones → correos → escrituras; una bitácora sin datos personales', async () => {
      const file = csvFile(STUDENTS_OK);
      const result = await service.commit('students', sha256Of(file.buffer), file, actor);
      expect(result).toEqual({ type: 'students', created: { users: 2, enrollments: 2, links: 0 } });
      expect(db.order).toEqual([
        'tx',
        'lock:year',
        'read:sections',
        'read:users',
        'write:users:2',
        'write:enrollments:2',
      ]);
      expect(db.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 20_000,
        maxWait: 5_000,
      });

      const users = db.prisma.user.createMany.mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(users[0]).toEqual({
        id: expect.stringMatching(UUID_V7),
        institutionalEmail: mail('qa1'),
        fullName: 'Ana Pérez',
        role: 'STUDENT',
      });
      const enrollments = db.prisma.enrollment.createMany.mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(enrollments[0]).toEqual({
        id: expect.stringMatching(UUID_V7),
        studentId: users[0].id,
        sectionId: 's3a',
        academicYearId: YEAR,
        isCurrent: true,
        effectiveFrom: expect.any(Date),
      });

      expect(audit.record).toHaveBeenCalledTimes(1);
      const event = audit.record.mock.calls[0][0] as Record<string, unknown>;
      expect(event).toMatchObject({
        actorId: 'adm1',
        module: 'users',
        action: 'users.import.commit',
        entityType: undefined,
        entityId: undefined,
        afterState: {
          type: 'students',
          format: 'csv',
          rows: 2,
          usersCreated: 2,
          enrollmentsCreated: 2,
          linksCreated: 0,
          userIds: users.map((u) => u.id),
        },
      });
      const serialized = JSON.stringify(event);
      expect(serialized).not.toMatch(/colegio\.example|Pérez|Rojas|Lista de 3A/);
    });

    it('students: año cerrado o ya no activo al bloquear → 409', async () => {
      const file = csvFile(STUDENTS_OK);
      db.state.year = { id: YEAR, active: 1, open: 0 };
      await expect(service.commit('students', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        'El año académico está cerrado',
      );
      db.state.year = { id: YEAR, active: 0, open: 1 };
      await expect(service.commit('students', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('guardians: estudiantes FOR UPDATE en orden de id antes de leer correos; vínculos TRUE', async () => {
      db.state.users.push(
        { id: 'e2', institutionalEmail: mail('hijo2'), role: 'STUDENT', status: 'ACTIVE' },
        { id: 'e1', institutionalEmail: mail('hijo1'), role: 'STUDENT', status: 'INACTIVE' },
      );
      const file = csvFile(
        `correo_apoderado;nombre_apoderado;correo_estudiante\npapa@gmail.com;Pedro Pérez;${mail('hijo2')}\npapa@gmail.com;Pedro Pérez;${mail('hijo1')}\n`,
      );
      const result = await service.commit('guardians', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 1, enrollments: 0, links: 2 });
      expect(db.order).toEqual([
        'read:users', // ids fuera de la transacción
        'tx',
        'lock:user:e1',
        'lock:user:e2',
        'read:users', // relectura tras el bloqueo
        'read:users', // correos usados
        'write:users:1',
        'write:links:2',
      ]);
      const links = db.prisma.guardianStudent.createMany.mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(links.map((l) => l.studentId)).toEqual(['e2', 'e1']);
      expect(links[0]).toMatchObject({ isActive: true, createdAt: expect.any(Date) });
    });

    it('guardians: estudiante retirado entre la vista previa y el bloqueo → 422', async () => {
      db.state.users.push({
        id: 'e1',
        institutionalEmail: mail('hijo1'),
        role: 'STUDENT',
        status: 'WITHDRAWN',
      });
      const file = csvFile(
        `correo_apoderado,nombre_apoderado,correo_estudiante\npapa@gmail.com,Pedro Pérez,${mail('hijo1')}\n`,
      );
      const error = await service
        .commit('guardians', sha256Of(file.buffer), file, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(JSON.stringify((error as UnprocessableEntityException).getResponse())).toContain(
        'STUDENT_WITHDRAWN',
      );
    });

    it('escribe en bloques de 500', async () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `${mail(`d${i}`)},Docente Ficticio`);
      const file = csvFile(`correo,nombre_completo\n${lines.join('\n')}\n`);
      await service.commit('teachers', sha256Of(file.buffer), file, actor);
      expect(db.prisma.user.createMany).toHaveBeenCalledTimes(2);
      expect(db.order.filter((o) => o.startsWith('write:'))).toEqual([
        'write:users:500',
        'write:users:500',
      ]);
    });

    it.each([
      ['P2002', 'Ya existe un usuario con ese correo'],
      ['P2034', 'El registro cambió o está en uso; vuelve a intentarlo'],
      ['P2028', 'El registro cambió o está en uso; vuelve a intentarlo'],
    ])('%s en la transacción → 409 sin bitácora', async (code, message) => {
      db.prisma.user.createMany.mockRejectedValueOnce(Object.assign(new Error('x'), { code }));
      const file = csvFile(`correo,nombre_completo\n${mail('d1')},Ana Pérez\n`);
      await expect(service.commit('teachers', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        message,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('si la bitácora falla, el commit igual responde (recordUsers nunca lanza)', async () => {
      audit.record.mockRejectedValueOnce(new Error('bd caída'));
      const file = csvFile(`correo,nombre_completo\n${mail('d1')},Ana Pérez\n`);
      await expect(service.commit('teachers', sha256Of(file.buffer), file, actor)).resolves.toEqual(
        { type: 'teachers', created: { users: 1, enrollments: 0, links: 0 } },
      );
    });
  });
});
