import { ConflictException } from '@nestjs/common';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AcademicCloneService } from './academic-clone.service.js';

// RF-15, hallazgo MEDIO 1 de seguridad de 6a: con copyTeachers, los docentes se bloquean
// FOR SHARE (en orden de id) ANTES que los años (orden User → AcademicYear), su rol y estado se
// leen de ese bloqueo, y los bloqueos mutuos (P2034, 1213) siguen respondiendo 409.

const SOURCE = '00000000-0000-4000-8000-000000002025';
const TARGET = '00000000-0000-4000-8000-000000002027';
const actor = { id: 'admin01', ip: '127.0.0.1' };

const years: Record<
  string,
  { id: string; year: number; isActive: boolean | null; closedAt: null }
> = {
  [SOURCE]: { id: SOURCE, year: 2025, isActive: null, closedAt: null },
  [TARGET]: { id: TARGET, year: 2027, isActive: null, closedAt: null },
};

const sourceSections = (teachers: string[]) => [
  {
    gradeLevel: 1,
    code: 'A',
    isActive: true,
    courseSections: teachers.map((t, i) => ({
      courseId: `c${i}`,
      teacherId: t,
      isActive: true,
      course: { isActive: true },
    })),
  },
];

function setup(options: {
  teachers?: string[];
  /** Docentes que la transacción ve (puede diferir de la lectura previa). */
  teachersInTx?: string[];
  users?: { id: string; role: string; status: string }[];
  failWith?: unknown;
}) {
  const teachers = options.teachers ?? ['t2', 't1'];
  const calls: string[] = [];
  const created: unknown[] = [];
  let inTx = false;
  const db = {
    $queryRaw: vi.fn((sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join('?');
      if (text.includes('FROM User')) {
        const joined = values[0] as { values?: unknown[] };
        calls.push(`User FOR SHARE ${(joined.values ?? []).join(',')}`);
        if (options.failWith) return Promise.reject(options.failWith);
        return Promise.resolve(options.users ?? []);
      }
      const id = values[0] as string;
      calls.push(`AcademicYear ${text.includes('FOR UPDATE') ? 'FOR UPDATE' : 'FOR SHARE'} ${id}`);
      const y = years[id];
      return Promise.resolve(y ? [{ id: y.id, year: y.year, active: 0, closedAt: null }] : []);
    }),
    academicYear: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(years[where.id] ?? null),
      ),
      findFirst: vi.fn(() => Promise.resolve({ year: 2026 })),
    },
    section: {
      count: vi.fn(() => Promise.resolve(0)),
      findMany: vi.fn(() =>
        Promise.resolve(sourceSections(inTx ? (options.teachersInTx ?? teachers) : teachers)),
      ),
      create: vi.fn((args: unknown) => {
        created.push(args);
        return Promise.resolve({ id: 's1' });
      }),
    },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      inTx = true;
      try {
        return await fn(db);
      } finally {
        inTx = false;
      }
    }),
  } as unknown as PrismaService;
  const audit = { record: vi.fn(() => Promise.resolve()) } as unknown as AuditService;
  return { service: new AcademicCloneService(prisma, audit), calls, created };
}

describe('AcademicCloneService: bloqueos con copyTeachers (RF-15)', () => {
  it('bloquea los docentes (ordenados por id) antes que los años y usa su estado bloqueado', async () => {
    const { service, calls, created } = setup({
      users: [
        { id: 't1', role: 'TEACHER', status: 'ACTIVE' },
        { id: 't2', role: 'TEACHER', status: 'INACTIVE' },
      ],
    });
    const result = await service.cloneStructure(
      TARGET,
      { sourceYearId: SOURCE, copyTeachers: true },
      actor,
    );
    expect(calls).toEqual([
      'User FOR SHARE t1,t2',
      `AcademicYear FOR SHARE ${SOURCE}`,
      `AcademicYear FOR UPDATE ${TARGET}`,
    ]);
    expect(result.created.teachersAssigned).toBe(1);
    expect(result.skipped.teachersNotActive).toBe(1);
    expect(JSON.stringify(created)).toContain('"teacherId":"t1"');
    expect(JSON.stringify(created)).not.toContain('"teacherId":"t2"');
  });

  it('sin copyTeachers no bloquea usuarios', async () => {
    const { service, calls } = setup({});
    await service.cloneStructure(TARGET, { sourceYearId: SOURCE, copyTeachers: false }, actor);
    expect(calls.some((c) => c.startsWith('User'))).toBe(false);
  });

  it('si dentro de la transacción aparece un docente no bloqueado → 409', async () => {
    const { service, created } = setup({
      teachers: ['t1'],
      teachersInTx: ['t1', 't9'],
      users: [{ id: 't1', role: 'TEACHER', status: 'ACTIVE' }],
    });
    await expect(
      service.cloneStructure(TARGET, { sourceYearId: SOURCE, copyTeachers: true }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(created).toEqual([]);
  });

  it.each([
    ['P2034', Object.assign(new Error('write conflict'), { code: 'P2034' })],
    ['1213', Object.assign(new Error('deadlock'), { errno: 1213 })],
    [
      'P2010 con 1213',
      Object.assign(new Error('raw'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '1213' } } },
      }),
    ],
  ])('un bloqueo mutuo (%s) al bloquear docentes responde 409', async (_name, error) => {
    const { service } = setup({ failWith: error });
    await expect(
      service.cloneStructure(TARGET, { sourceYearId: SOURCE, copyTeachers: true }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
