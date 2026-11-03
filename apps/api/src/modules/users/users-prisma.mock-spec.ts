// Prisma simulado para los .spec.ts del módulo users. El nombre termina en "-spec.ts": el build lo
// excluye (**/*spec.ts) y vitest no lo ejecuta como suite (solo **/*.spec.ts).
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { LockedUser } from './users-locks.js';

export type YearRow = { id: string; active: number; open: number };

/** Estado que consultan los $queryRaw simulados (bloqueos y búsqueda). */
export type RawState = {
  users: Map<string, LockedUser>;
  years: Map<string, YearRow>;
  activeAdmins: string[];
  searchIds: string[];
};

export function makePrisma() {
  const raw: RawState = {
    users: new Map(),
    years: new Map(),
    activeAdmins: [],
    searchIds: [],
  };
  // Registro del orden de los bloqueos y de los parámetros de cada $queryRaw.
  const rawCalls: { sql: string; values: unknown[] }[] = [];

  const queryRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    rawCalls.push({ sql, values });
    if (sql.includes('LOCATE')) return Promise.resolve(raw.searchIds.map((id) => ({ id })));
    if (sql.includes("role = 'ADMIN'")) {
      return Promise.resolve(raw.activeAdmins.map((id) => ({ id })));
    }
    if (sql.includes('FROM AcademicYear')) {
      const year = raw.years.get(values[0] as string);
      return Promise.resolve(year ? [year] : []);
    }
    if (sql.includes('FROM User')) {
      const user = raw.users.get(values[0] as string);
      return Promise.resolve(user ? [user] : []);
    }
    return Promise.reject(new Error(`SQL no simulado: ${sql}`));
  });

  const prisma = {
    $queryRaw: queryRaw,
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    enrollment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    section: { findUnique: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    guardianStudent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  // La transacción usa el mismo cliente simulado.
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

  return { prisma, raw, rawCalls, asService: prisma as unknown as PrismaService };
}

export const prismaError = (code: string): Error =>
  Object.assign(new Error(`prisma ${code}`), { code });

export const actor = { id: 'adm1', ip: '127.0.0.1' };

export const YEAR_2026 = 'y-2026';
export const YEAR_2025 = 'y-2025';

export const section = (
  id: string,
  gradeLevel: number,
  over: Partial<{ academicYearId: string; isActive: boolean }> = {},
) => ({ id, academicYearId: YEAR_2026, gradeLevel, isActive: true, ...over });

/** Fila de Enrollment con el include de las vistas. */
export const enrollmentRow = (
  id: string,
  sectionId: string,
  over: Partial<{
    isCurrent: boolean | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    endReason: 'TRANSFER' | 'WITHDRAWAL' | null;
    gradeLevel: number;
  }> = {},
) => ({
  id,
  studentId: 'est1',
  sectionId,
  academicYearId: YEAR_2026,
  isCurrent: over.isCurrent === undefined ? true : over.isCurrent,
  effectiveFrom: over.effectiveFrom ?? new Date('2026-03-01T00:00:00.000Z'),
  effectiveTo: over.effectiveTo ?? null,
  endReason: over.endReason ?? null,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  section: {
    id: sectionId,
    gradeLevel: over.gradeLevel ?? 3,
    code: sectionId.slice(-1).toUpperCase(),
    academicYear: { id: YEAR_2026, year: 2026 },
  },
});

export const userRow = (
  id: string,
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN',
  status: 'ACTIVE' | 'INACTIVE' | 'WITHDRAWN' = 'ACTIVE',
) => ({
  id,
  institutionalEmail: `${id}@colegio.example`,
  fullName: `Usuario Ficticio ${id}`,
  role,
  status,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});
