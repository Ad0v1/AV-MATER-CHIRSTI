import { fileURLToPath } from 'node:url';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';
import { PrismaClient } from './../src/generated/prisma/client.js';
import {
  ALL_USERS,
  COURSES,
  GUARDIAN_LINKS,
  SECTIONS,
  SEED_EMAIL_DOMAIN,
  STUDENTS,
  TEACHERS,
  TRANSFERRED_STUDENT,
  WITHDRAWN_STUDENT,
  YEARS,
  email,
} from './../../../prisma/seed/fixtures.js';

// Estos tests usan MySQL real (solo local con Docker). Cargan el .env de la raiz si existe.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

class Rollback extends Error {}

// Los datos de prueba usan años (2090+) y correos @colegio.example ficticios y se descartan
// con ROLLBACK, asi la BD y la idempotencia del seed no cambian.
describe.skipIf(!process.env.DATABASE_URL)('Esquema academico (e2e, MySQL)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Ejecuta `fn` dentro de una transaccion que siempre termina en rollback. */
  async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  }

  const newYear = (tx: Tx, year: number, isActive: boolean | null = null) =>
    tx.academicYear.create({ data: { year, isActive } });

  const newSection = (tx: Tx, academicYearId: string, gradeLevel = 3, code = 'Z') =>
    tx.section.create({ data: { academicYearId, gradeLevel, code } });

  const newGuardian = (tx: Tx, key: string) =>
    tx.user.create({
      data: {
        institutionalEmail: email(key),
        fullName: `Ficticio ${key}`,
        role: 'GUARDIAN',
      },
    });

  const newStudent = (tx: Tx, key: string) =>
    tx.user.create({
      data: {
        institutionalEmail: email(key),
        fullName: `Ficticio ${key}`,
        role: 'STUDENT',
      },
    });

  describe('RN-11: un solo año activo', () => {
    it('RN-11: un segundo año activo falla con P2002', async () => {
      await inRollback(async (tx) => {
        await expect(newYear(tx, 2090, true)).rejects.toMatchObject({ code: 'P2002' });
      });
    });

    it('RN-11: varios años no activos (isActive NULL) conviven', async () => {
      await inRollback(async (tx) => {
        await newYear(tx, 2090);
        await newYear(tx, 2091);
      });
    });
  });

  describe('RF-23/24: matriculas', () => {
    it('RF-24: una segunda matricula vigente en el mismo año falla con P2002', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const a = await newSection(tx, year.id, 3, 'A');
        const b = await newSection(tx, year.id, 3, 'B');
        const student = await newStudent(tx, 'qa-p2002');
        await tx.enrollment.create({
          data: { studentId: student.id, sectionId: a.id, academicYearId: year.id },
        });
        await expect(
          tx.enrollment.create({
            data: { studentId: student.id, sectionId: b.id, academicYearId: year.id },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });
    });

    it('RF-24: una matricula cerrada y una vigente del mismo alumno conviven (traslado)', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const a = await newSection(tx, year.id, 3, 'A');
        const b = await newSection(tx, year.id, 3, 'B');
        const student = await newStudent(tx, 'qa-traslado');
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            sectionId: a.id,
            academicYearId: year.id,
            isCurrent: null,
            effectiveFrom: new Date('2090-03-01T00:00:00Z'),
            effectiveTo: new Date('2090-06-15T00:00:00Z'),
            endReason: 'TRANSFER',
          },
        });
        await tx.enrollment.create({
          data: { studentId: student.id, sectionId: b.id, academicYearId: year.id },
        });
      });
    });

    it('RF-24: una matricula con la seccion de otro año falla por FK compuesta', async () => {
      await inRollback(async (tx) => {
        const yearA = await newYear(tx, 2090);
        const yearB = await newYear(tx, 2091);
        const sectionOfB = await newSection(tx, yearB.id);
        const student = await newStudent(tx, 'qa-fk');
        await expect(
          tx.enrollment.create({
            data: { studentId: student.id, sectionId: sectionOfB.id, academicYearId: yearA.id },
          }),
        ).rejects.toMatchObject({ code: 'P2003' });
      });
    });
  });

  describe('CHECK (MySQL error 3819)', () => {
    it('RN-11: AcademicYear.isActive = false viola AcademicYear_isActive_chk', async () => {
      await inRollback(async (tx) => {
        const err = await newYear(tx, 2090, false).catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/AcademicYear_isActive_chk/);
      });
    });

    it('RF-09: sequence y kind distintos violan AcademicPeriod_sequence_kind_chk', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const err = await tx.academicPeriod
          .create({
            data: {
              academicYearId: year.id,
              sequence: 1,
              kind: 'SECOND_BIMESTER',
              label: 'Incoherente',
              startDate: new Date('2090-03-01T00:00:00Z'),
              endDate: new Date('2090-04-30T00:00:00Z'),
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/AcademicPeriod_sequence_kind_chk/);
      });
    });

    it('RF-10: gradeLevel 6 viola Section_gradeLevel_chk', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const err = await newSection(tx, year.id, 6).catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/Section_gradeLevel_chk/);
      });
    });

    it('RF-24: matricula cerrada sin endReason viola Enrollment_isCurrent_chk', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const section = await newSection(tx, year.id);
        const student = await newStudent(tx, 'qa-check');
        const err = await tx.enrollment
          .create({
            data: {
              studentId: student.id,
              sectionId: section.id,
              academicYearId: year.id,
              isCurrent: null,
              effectiveFrom: new Date('2090-03-01T00:00:00Z'),
              effectiveTo: new Date('2090-06-15T00:00:00Z'),
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/Enrollment_isCurrent_chk/);
      });
    });

    it('RF-24: cerrar la matricula (isCurrent NULL) sin fecha ni motivo viola Enrollment_isCurrent_chk', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const section = await newSection(tx, year.id);
        const student = await newStudent(tx, 'qa-cierre');
        const err = await tx.enrollment
          .create({
            data: {
              studentId: student.id,
              sectionId: section.id,
              academicYearId: year.id,
              isCurrent: null,
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/Enrollment_isCurrent_chk/);
      });
    });

    it('RF-24: isCurrent = false viola Enrollment_isCurrent_chk (el marcador es TRUE o NULL)', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const section = await newSection(tx, year.id);
        const student = await newStudent(tx, 'qa-false');
        const err = await tx.enrollment
          .create({
            data: {
              studentId: student.id,
              sectionId: section.id,
              academicYearId: year.id,
              isCurrent: false,
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/Enrollment_isCurrent_chk/);
      });
    });

    it('RN-13: vinculo revocado (isActive NULL) sin revokedAt viola GuardianStudent_isActive_chk', async () => {
      await inRollback(async (tx) => {
        const guardian = await newGuardian(tx, 'qa-gchk1');
        const student = await newStudent(tx, 'qa-schk1');
        const err = await tx.guardianStudent
          .create({ data: { guardianId: guardian.id, studentId: student.id, isActive: null } })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/GuardianStudent_isActive_chk/);
      });
    });

    it('RN-13: vinculo con isActive = false viola GuardianStudent_isActive_chk', async () => {
      await inRollback(async (tx) => {
        const guardian = await newGuardian(tx, 'qa-gchk2');
        const student = await newStudent(tx, 'qa-schk2');
        const err = await tx.guardianStudent
          .create({ data: { guardianId: guardian.id, studentId: student.id, isActive: false } })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/GuardianStudent_isActive_chk/);
      });
    });

    it('RN-13: vinculo vigente con revokedAt viola GuardianStudent_isActive_chk', async () => {
      await inRollback(async (tx) => {
        const guardian = await newGuardian(tx, 'qa-gchk3');
        const student = await newStudent(tx, 'qa-schk3');
        const err = await tx.guardianStudent
          .create({
            data: {
              guardianId: guardian.id,
              studentId: student.id,
              isActive: true,
              revokedAt: new Date(Date.now() + 60_000),
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/GuardianStudent_isActive_chk/);
      });
    });

    it('RN-13: apoderado y estudiante con el mismo id violan GuardianStudent_distinct_chk', async () => {
      await inRollback(async (tx) => {
        const person = await newStudent(tx, 'qa-mismo');
        const err = await tx.guardianStudent
          .create({ data: { guardianId: person.id, studentId: person.id } })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/GuardianStudent_distinct_chk/);
      });
    });

    it('RN-13: revokedAt anterior a createdAt viola GuardianStudent_dates_chk', async () => {
      await inRollback(async (tx) => {
        const guardian = await newGuardian(tx, 'qa-gchk4');
        const student = await newStudent(tx, 'qa-schk4');
        const err = await tx.guardianStudent
          .create({
            data: {
              guardianId: guardian.id,
              studentId: student.id,
              isActive: null,
              createdAt: new Date('2090-06-01T00:00:00Z'),
              revokedAt: new Date('2090-05-01T00:00:00Z'),
            },
          })
          .catch((e: unknown) => e);
        expect(String(err)).toMatch(/3819/);
        expect(String(err)).toMatch(/GuardianStudent_dates_chk/);
      });
    });

    it('RN-13: un segundo vinculo vigente del mismo par falla con P2002; revocados conviven', async () => {
      await inRollback(async (tx) => {
        const guardian = await newGuardian(tx, 'qa-gdup');
        const student = await newStudent(tx, 'qa-sdup');
        const data = { guardianId: guardian.id, studentId: student.id };
        await tx.guardianStudent.create({ data });
        await expect(tx.guardianStudent.create({ data })).rejects.toMatchObject({ code: 'P2002' });
        const revoked = { ...data, isActive: null, revokedAt: new Date(Date.now() + 60_000) };
        await tx.guardianStudent.create({ data: revoked });
        await tx.guardianStudent.create({ data: revoked });
      });
    });
  });

  describe('RN-13: sin borrado fisico (Restrict)', () => {
    it('RN-13: borrar un User con matricula falla y el usuario sigue existiendo', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        const section = await newSection(tx, year.id);
        const student = await newStudent(tx, 'qa-restrict');
        await tx.enrollment.create({
          data: { studentId: student.id, sectionId: section.id, academicYearId: year.id },
        });
        await expect(tx.user.delete({ where: { id: student.id } })).rejects.toMatchObject({
          code: 'P2003',
        });
        expect(await tx.user.count({ where: { id: student.id } })).toBe(1);
      });
    });

    it('RN-13: borrar un año con secciones falla', async () => {
      await inRollback(async (tx) => {
        const year = await newYear(tx, 2090);
        await newSection(tx, year.id);
        await expect(tx.academicYear.delete({ where: { id: year.id } })).rejects.toMatchObject({
          code: 'P2003',
        });
      });
    });
  });

  describe('Seed de desarrollo (D-028)', () => {
    it('RF-09..25: conteos esperados de las tablas academicas', async () => {
      const counts = await Promise.all([
        prisma.academicYear.count(),
        prisma.academicPeriod.count(),
        prisma.section.count(),
        prisma.course.count(),
        prisma.courseSection.count(),
        prisma.enrollment.count(),
        prisma.enrollment.count({ where: { isCurrent: true } }),
        prisma.guardianStudent.count({ where: { isActive: true } }), // vigentes (RN-13)
        prisma.academicPeriod.count({ where: { closedAt: { not: null } } }),
      ]);
      expect(counts).toEqual([
        YEARS.length, // 2
        8,
        SECTIONS.length, // 7
        COURSES.length, // 5
        30,
        62,
        59,
        GUARDIAN_LINKS.length, // 3
        5,
      ]);
    });

    it('RF-18..20: conteos de usuarios por rol', async () => {
      const byRole = async (role: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'ADMIN') =>
        prisma.user.count({
          where: { role, institutionalEmail: { endsWith: `@${SEED_EMAIL_DOMAIN}` } },
        });
      expect(await byRole('STUDENT')).toBe(STUDENTS.length);
      expect(await byRole('TEACHER')).toBe(TEACHERS.length);
      expect(await byRole('GUARDIAN')).toBe(2);
      expect(await byRole('ADMIN')).toBe(1);
      expect(ALL_USERS).toHaveLength(68);
    });

    it('RNF-09: todos los correos del seed estan en @colegio.example', async () => {
      const users = await prisma.user.findMany({ select: { institutionalEmail: true } });
      expect(users.length).toBeGreaterThanOrEqual(ALL_USERS.length);
      for (const u of users) {
        // Los usuarios nuevos nacen sin correo del colegio (D-058): solo se revisan los que lo tienen.
        if (u.institutionalEmail === null) continue;
        expect(u.institutionalEmail.endsWith(`@${SEED_EMAIL_DOMAIN}`)).toBe(true);
      }
    });

    it('RN-11: el año 2026 es el unico activo y el 2025 esta cerrado', async () => {
      const active = await prisma.academicYear.findMany({ where: { isActive: true } });
      expect(active.map((y) => y.year)).toEqual([2026]);
      const past = await prisma.academicYear.findUniqueOrThrow({ where: { year: 2025 } });
      expect(past.isActive).toBeNull();
      expect(past.closedAt).not.toBeNull();
    });

    it('RF-24: estudiante03 tiene matricula cerrada TRANSFER en 3A y vigente en 3B', async () => {
      const rows = await prisma.enrollment.findMany({
        where: { student: { institutionalEmail: email(TRANSFERRED_STUDENT) } },
        include: { section: true },
        orderBy: { effectiveFrom: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ isCurrent: null, endReason: 'TRANSFER' });
      expect(`${rows[0]!.section.gradeLevel}${rows[0]!.section.code}`).toBe('3A');
      expect(rows[1]).toMatchObject({ isCurrent: true, endReason: null });
      expect(`${rows[1]!.section.gradeLevel}${rows[1]!.section.code}`).toBe('3B');
    });

    it('RF-23: estudiante60 esta WITHDRAWN con matricula cerrada WITHDRAWAL y sin vigente', async () => {
      const student = await prisma.user.findUniqueOrThrow({
        where: { institutionalEmail: email(WITHDRAWN_STUDENT) },
        include: { enrollments: true },
      });
      expect(student.status).toBe('WITHDRAWN');
      expect(student.enrollments).toHaveLength(1);
      expect(student.enrollments[0]).toMatchObject({ isCurrent: null, endReason: 'WITHDRAWAL' });
    });

    it('RF-25: los tests no dejaron datos de prueba (años 2090+ ni correos qa-)', async () => {
      expect(await prisma.academicYear.count({ where: { year: { gte: 2090 } } })).toBe(0);
      expect(
        await prisma.user.count({ where: { institutionalEmail: { startsWith: 'qa-' } } }),
      ).toBe(0);
    });
  });
});
