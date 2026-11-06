// Prisma simulado para los .spec.ts del módulo users. El nombre termina en "-spec.ts": el build lo
// excluye (**/*spec.ts) y vitest no lo ejecuta como suite (solo **/*.spec.ts).
import type { Mock } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { CredentialIssuerService } from '../auth/credential-issuer.service.js';
import type { LockedUser } from './users-locks.js';

export type YearRow = { id: string; active: number; open: number };

/** Estado que consultan los $queryRaw simulados (bloqueos y búsqueda). */
export type RawState = {
  users: Map<string, LockedUser>;
  years: Map<string, YearRow>;
  activeAdmins: string[];
  searchIds: string[];
};

// Anotado como Mock: el tipo inferido de vi.fn no es portable con declaration: true (TS2883).
const fn = (): Mock => vi.fn();
const mock = vi.fn as unknown as (impl?: (...args: never[]) => unknown) => Mock;

export function makePrisma() {
  const raw: RawState = {
    users: new Map(),
    years: new Map(),
    activeAdmins: [],
    searchIds: [],
  };
  // Registro del orden de los bloqueos y de los parámetros de cada $queryRaw.
  const rawCalls: { sql: string; values: unknown[] }[] = [];

  const queryRaw: Mock = mock((strings: TemplateStringsArray, ...values: unknown[]) => {
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
    $transaction: fn(),
    user: {
      findUnique: fn(),
      findUniqueOrThrow: fn(),
      findMany: fn(),
      count: fn(),
      create: fn(),
      update: fn(),
    },
    enrollment: {
      findFirst: fn(),
      findMany: fn(),
      findUniqueOrThrow: fn(),
      updateMany: fn(),
      create: fn(),
    },
    section: { findUnique: fn() },
    academicYear: { findFirst: fn() },
    guardianStudent: {
      findFirst: mock(),
      findMany: mock(),
      findUnique: mock(),
      findUniqueOrThrow: mock(),
      create: mock(),
      count: mock().mockResolvedValue(0),
      update: mock(),
      updateMany: mock(),
    },
  };
  // La transacción usa el mismo cliente simulado.
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) => cb(prisma));

  return { prisma, raw, rawCalls, asService: prisma as unknown as PrismaService };
}

/**
 * Emisor de credenciales simulado: crea usuarios ficticios sin tocar la base. Un alumno nuevo es
 * `nuevo` y un apoderado nuevo es `gnuevo`.
 */
export function makeIssuer() {
  const issuer = {
    createUser: mock(
      (_tx: unknown, input: { role: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'ADMIN' }) =>
        Promise.resolve({
          user: userRow(input.role === 'GUARDIAN' ? 'gnuevo' : 'nuevo', input.role),
          credentials: { code: '2600000000', initialPassword: 'Clave-Inicial-9' },
        }),
    ),
    findByDni: mock().mockResolvedValue(null),
    assertDniFree: mock().mockResolvedValue(undefined),
    hashDni: mock((dni: string) => `hash-${dni}`),
    dniData: mock((dni: string) => ({ dniEncrypted: `enc-${dni}`, dniHash: `hash-${dni}` })),
    reissue: mock().mockResolvedValue({
      code: '2600000000',
      initialPassword: 'Clave-Temporal-7',
      previousCode: null,
    }),
  };
  return { issuer, asIssuer: issuer as unknown as CredentialIssuerService };
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
  code: null,
  email: `${id}@colegio.example`,
  contactEmail: null,
  emailVerifiedAt: null,
  phone: null,
  address: null,
  dniVerifiedAt: null,
  fullName: `Usuario Ficticio ${id}`,
  role,
  status,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});
