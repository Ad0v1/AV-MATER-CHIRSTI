import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AuditService } from '../../../common/audit/audit.service.js';
import type { PrismaService } from '../../../common/prisma/prisma.service.js';
import type { Env } from '../../../config/env.js';
import type { AcademicAccessService } from '../../academic/academic-access.service.js';
import { DniService } from '../../auth/dni.service.js';
import { PasswordService } from '../../auth/password.service.js';
import type { UserCodeService } from '../../auth/user-code.service.js';
import { sha256Of } from './import-file.js';
import { UserImportService } from './user-import.service.js';

const YEAR = 'y-2026';
const actor = { id: 'adm1', ip: '127.0.0.1' };
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const dni = new DniService({ PII_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') } as Env);
const D = (n: number) => String(10_000_000 + n);

const csvFile = (text: string) => {
  const buffer = Buffer.from(text, 'utf8');
  return { originalname: 'Lista de 3A.csv', size: buffer.length, buffer };
};

type User = { id: string; dniHash: string; role: string; status: string };
const person = (id: string, dniNumber: string, role: string, status = 'ACTIVE'): User => ({
  id,
  dniHash: dni.hash(dniNumber),
  role,
  status,
});

/** Prisma simulado: guarda el orden de las operaciones para comprobar el orden de bloqueos. */
function makeDb() {
  const order: string[] = [];
  const state = {
    users: [] as User[],
    links: [] as Array<{ studentId: string; guardianId: string }>,
    sections: [
      { id: 's3a', academicYearId: YEAR, gradeLevel: 3, code: 'A', isActive: true },
      { id: 's3b', academicYearId: YEAR, gradeLevel: 3, code: 'B', isActive: false },
    ],
    year: { id: YEAR, active: 1, open: 1 } as { id: string; active: number; open: number } | null,
    closedAt: null as Date | null,
  };
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
      findMany: vi.fn((args: { where: { dniHash: { in: string[] } } }) => {
        order.push('read:users');
        return Promise.resolve(
          state.users.filter((u) => args.where.dniHash.in.includes(u.dniHash)),
        );
      }),
      createMany: vi.fn((args: { data: unknown[] }) => {
        order.push(`write:users:${args.data.length}`);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    localCredential: {
      createMany: vi.fn((args: { data: unknown[] }) => {
        order.push(`write:credentials:${args.data.length}`);
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
      findMany: vi.fn((args: { where: { studentId: { in: string[] } } }) => {
        order.push('read:links');
        return Promise.resolve(
          state.links.filter((l) => args.where.studentId.in.includes(l.studentId)),
        );
      }),
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

async function sheetOf(base64: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  return workbook;
}

describe('UserImportService (RF-21, RF-76, RF-77)', () => {
  let db: ReturnType<typeof makeDb>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let access: { getActiveYear: ReturnType<typeof vi.fn> };
  let service: UserImportService;

  beforeEach(() => {
    db = makeDb();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    access = { getActiveYear: vi.fn().mockResolvedValue({ id: YEAR, year: 2026 }) };
    const codes = {
      generateMany: vi.fn((count: number) =>
        Promise.resolve(Array.from({ length: count }, (_, i) => `26${String(i).padStart(8, '0')}`)),
      ),
    };
    service = new UserImportService(
      db.asService,
      audit as unknown as AuditService,
      access as unknown as AcademicAccessService,
      dni,
      codes as unknown as UserCodeService,
    );
  });

  const HEADER =
    'dni,nombre_completo,grado,seccion,dni_apoderado,nombre_apoderado,dni_apoderado_2,nombre_apoderado_2';
  // Dos hermanos con el mismo apoderado (nombre en una sola fila) y un tercer alumno con otro.
  const STUDENTS_OK = [
    HEADER,
    `${D(1)},Ana Pérez,3,a,${D(500)},Padre Común,,`,
    `${D(2)},Luis Pérez,3,A,${D(500)},,,`,
    '',
  ].join('\n');

  describe('preview', () => {
    it('valida contra la BD sin escribir ni registrar bitácora', async () => {
      db.state.users.push(person('u2', D(2), 'STUDENT'));
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
        // Una fila válida: la alumna y un apoderado nuevo (el de la fila 3 no cuenta).
        summary: { users: 2, enrollments: 1, links: 1 },
        canConfirm: false,
      });
      expect(report.errors).toEqual([
        {
          row: 3,
          column: 'dni',
          code: 'DNI_TAKEN',
          message: 'Ya existe una persona registrada con ese DNI',
        },
      ]);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
      expect(db.prisma.user.createMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('el nombre de un apoderado nuevo es obligatorio en alguna de sus filas', async () => {
      const file = csvFile(`${HEADER}\n${D(1)},Ana Pérez,3,A,${D(500)},,,\n`);
      const report = await service.preview('students', file);
      expect(report.errors.map((e) => e.code)).toEqual(['GUARDIAN_NAME_REQUIRED']);
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
        csvFile(`dni,nombre_completo\n${D(3)},Ana Pérez\n`),
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
      const file = csvFile('dni,nombre_completo\n123,Ana Pérez\n');
      const error = await service
        .commit('teachers', sha256Of(file.buffer), file, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: [
          {
            row: 2,
            column: 'dni',
            code: 'INVALID_DNI',
            message:
              'El DNI debe tener 8 dígitos (si empieza con 0, da formato de texto a la columna)',
          },
        ],
      });
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('errores contra la BD dentro de la transacción → 422 sin escribir nada', async () => {
      db.state.sections[0]!.isActive = false;
      const file = csvFile(STUDENTS_OK);
      await expect(service.commit('students', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(db.order.some((o) => o.startsWith('write:'))).toBe(false);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('students: crea alumnos y apoderados con credenciales, matrículas y vínculos; el primero es el principal', async () => {
      const file = csvFile(STUDENTS_OK);
      const result = await service.commit('students', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 3, enrollments: 2, links: 2 });

      // Orden: bloqueo del año, relectura, y recién entonces las escrituras.
      expect(db.order.indexOf('lock:year')).toBeLessThan(db.order.lastIndexOf('read:sections'));
      expect(db.order.slice(db.order.indexOf('write:users:3'))).toEqual([
        'write:users:3',
        'write:credentials:3',
        'write:enrollments:2',
        'write:links:2',
      ]);
      expect(db.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 20_000,
        maxWait: 5_000,
      });

      const users = db.prisma.user.createMany.mock.calls[0]![0].data as Array<
        Record<string, unknown>
      >;
      expect(users.map((u) => u.role)).toEqual(['STUDENT', 'GUARDIAN', 'STUDENT']);
      expect(users[0]).toEqual({
        id: expect.stringMatching(UUID_V7),
        code: '2600000000',
        fullName: 'Ana Pérez',
        role: 'STUDENT',
        dniEncrypted: expect.any(String),
        dniHash: dni.hash(D(1)),
      });
      // El DNI se guarda cifrado y no en claro.
      expect(String(users[0]!.dniEncrypted)).not.toContain(D(1));
      expect(dni.decrypt(String(users[0]!.dniEncrypted))).toBe(D(1));

      const credentials = db.prisma.localCredential.createMany.mock.calls[0]![0].data as Array<{
        userId: string;
        passwordHash: string;
        mustChangePassword: boolean;
      }>;
      expect(credentials.every((c) => c.mustChangePassword)).toBe(true);
      expect(credentials.map((c) => c.userId)).toEqual(users.map((u) => u.id));

      const links = db.prisma.guardianStudent.createMany.mock.calls[0]![0].data as Array<
        Record<string, unknown>
      >;
      // Los dos hijos comparten el mismo apoderado, que es el principal de cada uno.
      expect(links.map((l) => [l.guardianId, l.isPrimary, l.isActive])).toEqual([
        [users[1]!.id, true, true],
        [users[1]!.id, true, true],
      ]);
    });

    it('la hoja de credenciales trae código y contraseña de cada cuenta nueva y nada del DNI', async () => {
      const file = csvFile(STUDENTS_OK);
      const result = await service.commit('students', sha256Of(file.buffer), file, actor);
      const sheet = result.credentialsSheet!;
      expect(sheet.filename).toMatch(/^credenciales-students-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(sheet.contentType).toContain('spreadsheetml');

      const workbook = await sheetOf(sheet.base64);
      const rows = workbook.getWorksheet('Credenciales')!;
      expect(rows.rowCount).toBe(1 + 3);
      const body: string[][] = [];
      rows.eachRow((row, n) => {
        if (n > 1) body.push((row.values as unknown[]).slice(1).map(String));
      });
      // Estudiantes, luego apoderados, ordenados por nombre.
      expect(body.map((r) => r[0])).toEqual(['Estudiante', 'Estudiante', 'Apoderado']);
      expect(body.map((r) => r[1])).toEqual(['Ana Pérez', 'Luis Pérez', 'Padre Común']);
      expect(body[0]![2]).toBe('3.º A');

      const credentials = db.prisma.localCredential.createMany.mock.calls[0]![0].data as Array<{
        userId: string;
        passwordHash: string;
      }>;
      const users = db.prisma.user.createMany.mock.calls[0]![0].data as Array<{ id: string }>;
      const passwords = new PasswordService();
      for (const row of body) {
        expect(row[3]).toMatch(/^26\d{8}$/);
        expect(row[4]).toHaveLength(12);
      }
      // Cada contraseña de la hoja es la que quedó guardada (con hash) para esa cuenta.
      const byName: Record<string, number> = { 'Ana Pérez': 0, 'Padre Común': 1, 'Luis Pérez': 2 };
      for (const row of body) {
        const index = byName[row[1]!]!;
        const stored = credentials.find((c) => c.userId === users[index]!.id)!;
        expect(await passwords.verify(stored.passwordHash, row[4]!)).toBe(true);
      }
      expect(JSON.stringify(workbook.model)).not.toContain(D(1));
    });

    it('students: un apoderado que ya existe se reutiliza (no se crea ni sale en la hoja)', async () => {
      db.state.users.push(person('g1', D(500), 'GUARDIAN'));
      const file = csvFile(`${HEADER}\n${D(1)},Ana Pérez,3,A,${D(500)},,,\n`);
      const result = await service.commit('students', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 1, enrollments: 1, links: 1 });
      const links = db.prisma.guardianStudent.createMany.mock.calls[0]![0].data as Array<
        Record<string, unknown>
      >;
      expect(links[0]).toMatchObject({ guardianId: 'g1', isPrimary: true });
      const workbook = await sheetOf(result.credentialsSheet!.base64);
      expect(workbook.getWorksheet('Credenciales')!.rowCount).toBe(2);
      // El apoderado existente se bloqueó antes de vincularlo.
      expect(db.order).toContain('lock:user:g1');
      expect(db.order.indexOf('lock:user:g1')).toBeLessThan(db.order.indexOf('write:users:1'));
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

    it('guardians: bloquea a los estudiantes en orden de id y vincula con un principal solo al primero', async () => {
      db.state.users.push(
        person('e2', D(12), 'STUDENT'),
        person('e1', D(11), 'STUDENT', 'INACTIVE'),
      );
      const file = csvFile(
        `dni_apoderado;nombre_apoderado;dni_estudiante\n${D(1)};Pedro Pérez;${D(12)}\n${D(1)};Pedro Pérez;${D(11)}\n${D(2)};Rosa Pérez;${D(11)}\n`,
      );
      const result = await service.commit('guardians', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 2, enrollments: 0, links: 3 });
      const locks = db.order.filter((o) => o.startsWith('lock:user:'));
      expect(locks).toEqual(['lock:user:e1', 'lock:user:e2']);
      const links = db.prisma.guardianStudent.createMany.mock.calls[0]![0].data as Array<
        Record<string, unknown>
      >;
      expect(links.map((l) => [l.studentId, l.isPrimary])).toEqual([
        ['e2', true],
        ['e1', true],
        ['e1', null],
      ]);
    });

    it('guardians: un estudiante con 2 apoderados no admite otro (422)', async () => {
      db.state.users.push(person('e1', D(11), 'STUDENT'));
      db.state.links.push(
        { studentId: 'e1', guardianId: 'a' },
        { studentId: 'e1', guardianId: 'b' },
      );
      const file = csvFile(
        `dni_apoderado,nombre_apoderado,dni_estudiante\n${D(1)},Pedro Pérez,${D(11)}\n`,
      );
      const error = await service
        .commit('guardians', sha256Of(file.buffer), file, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(JSON.stringify((error as UnprocessableEntityException).getResponse())).toContain(
        'MAX_GUARDIANS',
      );
      expect(db.order.some((o) => o.startsWith('write:'))).toBe(false);
    });

    it('guardians: estudiante retirado entre la vista previa y el bloqueo → 422', async () => {
      db.state.users.push(person('e1', D(11), 'STUDENT', 'WITHDRAWN'));
      const file = csvFile(
        `dni_apoderado,nombre_apoderado,dni_estudiante\n${D(1)},Pedro Pérez,${D(11)}\n`,
      );
      const error = await service
        .commit('guardians', sha256Of(file.buffer), file, actor)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(JSON.stringify((error as UnprocessableEntityException).getResponse())).toContain(
        'STUDENT_WITHDRAWN',
      );
    });

    it('guardians: si solo se vinculan apoderados que ya existen, no hay hoja de credenciales', async () => {
      db.state.users.push(person('e1', D(11), 'STUDENT'), person('g1', D(1), 'GUARDIAN'));
      const file = csvFile(`dni_apoderado,nombre_apoderado,dni_estudiante\n${D(1)},,${D(11)}\n`);
      const result = await service.commit('guardians', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 0, enrollments: 0, links: 1 });
      expect(result.credentialsSheet).toBeNull();
    });

    it('una sola bitácora con ids y conteos, sin DNI, nombres, códigos ni contraseñas', async () => {
      const file = csvFile(STUDENTS_OK);
      const result = await service.commit('students', sha256Of(file.buffer), file, actor);
      expect(audit.record).toHaveBeenCalledTimes(1);
      const event = audit.record.mock.calls[0]![0] as Record<string, unknown>;
      const users = db.prisma.user.createMany.mock.calls[0]![0].data as Array<{ id: string }>;
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
          usersCreated: 3,
          enrollmentsCreated: 2,
          linksCreated: 2,
          userIds: users.map((u) => u.id),
        },
      });
      const text = JSON.stringify(event);
      expect(text).not.toMatch(/Pérez|Lista de 3A/);
      expect(text).not.toContain(D(1));
      expect(text).not.toContain('2600000000');
      const workbook = await sheetOf(result.credentialsSheet!.base64);
      const passwordCell = workbook.getWorksheet('Credenciales')!.getCell('E2').value as string;
      expect(text).not.toContain(passwordCell);
    });

    it('escribe en bloques de 500', async () => {
      const lines = Array.from({ length: 1000 }, (_, i) => `${D(i)},Docente Ficticio`);
      const file = csvFile(`dni,nombre_completo\n${lines.join('\n')}\n`);
      await service.commit('teachers', sha256Of(file.buffer), file, actor);
      expect(db.prisma.user.createMany).toHaveBeenCalledTimes(2);
      expect(db.order.filter((o) => o.startsWith('write:users'))).toEqual([
        'write:users:500',
        'write:users:500',
      ]);
      expect(db.order.filter((o) => o.startsWith('write:credentials'))).toEqual([
        'write:credentials:500',
        'write:credentials:500',
      ]);
    }, 120_000);

    it.each([
      ['P2002', 'Ya existe un registro con esos datos (DNI, correo o código); vuelve a intentarlo'],
      ['P2034', 'El registro cambió o está en uso; vuelve a intentarlo'],
      ['P2028', 'El registro cambió o está en uso; vuelve a intentarlo'],
    ])('%s en la transacción → 409 sin bitácora', async (code, message) => {
      db.prisma.user.createMany.mockRejectedValueOnce(Object.assign(new Error('x'), { code }));
      const file = csvFile(`dni,nombre_completo\n${D(3)},Ana Pérez\n`);
      await expect(service.commit('teachers', sha256Of(file.buffer), file, actor)).rejects.toThrow(
        message,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('si la bitácora falla, el commit igual responde (recordUsers nunca lanza)', async () => {
      audit.record.mockRejectedValueOnce(new Error('bd caída'));
      const file = csvFile(`dni,nombre_completo\n${D(3)},Ana Pérez\n`);
      const result = await service.commit('teachers', sha256Of(file.buffer), file, actor);
      expect(result.created).toEqual({ users: 1, enrollments: 0, links: 0 });
      expect(result.credentialsSheet).not.toBeNull();
    });
  });
});
