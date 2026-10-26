import { ConflictException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { AuditService, type AuditSink } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from './academic-access.service.js';
import { recordAcademic } from './academic-audit.js';
import { AcademicEventPublisher } from './academic-events.js';
import { AcademicPeriodsService } from './academic-periods.service.js';
import { AcademicYearsService } from './academic-years.service.js';

// Hallazgos MEDIO 1-3 de seguridad-cumplimiento: comprobaciones repetidas dentro de la
// transacción. Prisma simulado con un almacén en memoria y rollback si la callback lanza.

type Year = { id: string; year: number; isActive: boolean | null; closedAt: Date | null };
type Period = { id: string; academicYearId: string; closedAt: Date | null };

const actor = { id: 'admin01', ip: '127.0.0.1' };
const CLOSED_AT = new Date('2026-12-20T00:00:00.000Z');
const REASON = { reason: 'Corrección de notas' };

function makeDb(initialYears: Year[], initialPeriods: Period[] = []) {
  let years = initialYears.map((y) => ({ ...y }));
  let periods = initialPeriods.map((p) => ({ ...p }));
  // Simula lo que otra petición confirma entre la lectura previa y la transacción.
  const hooks = { beforeTx: (): void => undefined };

  const matchYear = (y: Year, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => y[k as keyof Year] === v);

  const client = {
    $queryRaw: vi.fn((_sql: TemplateStringsArray, id: string) =>
      Promise.resolve(years.filter((y) => y.id === id).map((y) => ({ id: y.id }))),
    ),
    academicYear: {
      // Con periods: [] para que get() pueda armar el detalle.
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        const y = years.find((x) => x.id === where.id);
        return Promise.resolve(y ? { ...y, periods: [] } : null);
      }),
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(years.find((y) => matchYear(y, where)) ?? null),
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: Record<string, unknown>; data: Partial<Year> }) => {
          const hits = years.filter((y) => matchYear(y, where));
          for (const y of hits) Object.assign(y, data);
          // UNIQUE del marcador isActive.
          if (years.filter((y) => y.isActive === true).length > 1) {
            return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
          }
          return Promise.resolve({ count: hits.length });
        },
      ),
    },
    academicPeriod: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        const p = periods.find((x) => x.id === where.id);
        if (!p) return Promise.resolve(null);
        return Promise.resolve({
          ...p,
          sequence: 1,
          kind: 'BIMESTER_1',
          label: 'I Bimestre',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-05-01T00:00:00.000Z'),
          academicYear: { ...years.find((y) => y.id === p.academicYearId) },
        });
      }),
      count: vi.fn(({ where }: { where: { academicYearId: string } }) =>
        Promise.resolve(
          periods.filter((p) => p.academicYearId === where.academicYearId && p.closedAt === null)
            .length,
        ),
      ),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; academicYear: { isActive: boolean; closedAt: null } };
          data: Partial<Period>;
        }) => {
          const hits = periods.filter((p) => {
            const y = years.find((x) => x.id === p.academicYearId);
            return (
              p.id === where.id &&
              p.closedAt !== null &&
              y?.isActive === where.academicYear.isActive &&
              y.closedAt === where.academicYear.closedAt
            );
          });
          for (const p of hits) Object.assign(p, data);
          return Promise.resolve({ count: hits.length });
        },
      ),
    },
  };

  const prisma = {
    ...client,
    $transaction: vi.fn(async (cb: (tx: typeof client) => Promise<unknown>) => {
      hooks.beforeTx();
      const savedYears = years.map((y) => ({ ...y }));
      const savedPeriods = periods.map((p) => ({ ...p }));
      try {
        return await cb(client);
      } catch (error) {
        years = savedYears;
        periods = savedPeriods;
        throw error;
      }
    }),
  };

  const find = <T extends { id: string }>(list: () => T[], id: string) =>
    list().find((x) => x.id === id);

  return {
    prisma,
    hooks,
    year: (id: string) => find(() => years, id),
    period: (id: string) => find(() => periods, id),
    setYear: (id: string, data: Partial<Year>) => {
      Object.assign(find(() => years, id) ?? {}, data);
    },
    closeYearNow: (id: string) => {
      Object.assign(find(() => years, id) ?? {}, { closedAt: CLOSED_AT, isActive: null });
    },
    openPeriod: (id: string) => {
      Object.assign(find(() => periods, id) ?? {}, { closedAt: null });
    },
  };
}

function makeServices(db: ReturnType<typeof makeDb>) {
  const sink = { write: vi.fn().mockResolvedValue(undefined) };
  const audit = new AuditService(sink as unknown as AuditSink);
  const events = new AcademicEventPublisher();
  const publish = vi.spyOn(events, 'publish');
  const access = {
    getActiveYear: vi.fn().mockResolvedValue(null),
  } as unknown as AcademicAccessService;
  const prisma = db.prisma as unknown as PrismaService;
  return {
    sink,
    publish,
    years: new AcademicYearsService(prisma, audit, events, access),
    periods: new AcademicPeriodsService(prisma, audit, events, access),
  };
}

const twoYears = (): Year[] => [
  { id: 'y25', year: 2025, isActive: true, closedAt: null },
  { id: 'y26', year: 2026, isActive: null, closedAt: null },
];

const activeYearWithClosedPeriod = () =>
  makeDb(
    [{ id: 'y26', year: 2026, isActive: true, closedAt: null }],
    [{ id: 'p1', academicYearId: 'y26', closedAt: CLOSED_AT }],
  );

describe('Comprobaciones dentro de la transacción (MEDIO 1-2)', () => {
  describe('activar año (RN-11)', () => {
    it('activa el nuevo y deja el anterior en NULL', async () => {
      const db = makeDb(twoYears());
      const { years, sink } = makeServices(db);
      await years.activate('y26', actor);
      expect(db.year('y26')?.isActive).toBe(true);
      expect(db.year('y25')?.isActive).toBeNull();
      expect(sink.write).toHaveBeenCalledTimes(2);
    });

    it('409 si el año se cierra antes de la transacción, sin desactivar el anterior', async () => {
      const db = makeDb(twoYears());
      const { years, sink } = makeServices(db);
      db.hooks.beforeTx = () => db.closeYearNow('y26');

      await expect(years.activate('y26', actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.year('y25')?.isActive).toBe(true);
      expect(db.year('y26')?.isActive).toBeNull();
      expect(sink.write).not.toHaveBeenCalled();
    });

    it('409 sin transacción si el año ya estaba cerrado', async () => {
      const db = makeDb([{ id: 'y24', year: 2024, isActive: null, closedAt: CLOSED_AT }]);
      const { years } = makeServices(db);
      await expect(years.activate('y24', actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cerrar año (RF-17)', () => {
    it('bloquea la fila del año y cierra con todos los períodos cerrados', async () => {
      const db = activeYearWithClosedPeriod();
      const { years, publish } = makeServices(db);
      await years.close('y26', actor);
      expect(db.prisma.$queryRaw).toHaveBeenCalled();
      expect(db.year('y26')?.closedAt).not.toBeNull();
      expect(db.year('y26')?.isActive).toBeNull();
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'academic-year.closed.v1' }),
      );
    });

    it('422 si un período se reabre antes de la transacción; el año sigue abierto', async () => {
      const db = activeYearWithClosedPeriod();
      const { years, sink, publish } = makeServices(db);
      db.hooks.beforeTx = () => db.openPeriod('p1');

      await expect(years.close('y26', actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(db.year('y26')?.closedAt).toBeNull();
      expect(db.year('y26')?.isActive).toBe(true);
      expect(sink.write).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('409 si otro cierre gana la carrera (updateMany con count 0)', async () => {
      const db = activeYearWithClosedPeriod();
      const { years, publish } = makeServices(db);
      db.hooks.beforeTx = () => db.closeYearNow('y26');

      await expect(years.close('y26', actor)).rejects.toBeInstanceOf(ConflictException);
      expect(publish).not.toHaveBeenCalled();
    });
  });

  describe('reabrir período (RF-11 / RN-10)', () => {
    it('reabre en el año activo y sin cerrar', async () => {
      const db = activeYearWithClosedPeriod();
      const { periods } = makeServices(db);
      await periods.reopen('p1', REASON, actor);
      expect(db.period('p1')?.closedAt).toBeNull();
    });

    it('409 si el año deja de estar activo antes de la transacción', async () => {
      const db = activeYearWithClosedPeriod();
      const { periods, sink, publish } = makeServices(db);
      db.hooks.beforeTx = () => db.setYear('y26', { isActive: null });

      await expect(periods.reopen('p1', REASON, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.period('p1')?.closedAt).toEqual(CLOSED_AT);
      expect(sink.write).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('409 si el año se cierra antes de la transacción', async () => {
      const db = activeYearWithClosedPeriod();
      const { periods } = makeServices(db);
      db.hooks.beforeTx = () => db.closeYearNow('y26');

      await expect(periods.reopen('p1', REASON, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(db.period('p1')?.closedAt).toEqual(CLOSED_AT);
    });
  });
});

describe('recordAcademic con bitácora que falla (MEDIO 3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no lanza y registra solo action, entityType, entityId y actorId', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sink = { write: vi.fn().mockRejectedValue(new Error('fallo con dato@correo.pe')) };
    const audit = new AuditService(sink as unknown as AuditSink);

    await expect(
      recordAcademic(audit, actor, 'period.reopen', 'AcademicPeriod', 'p1', {
        before: { closedAt: '2026-05-01' },
        after: { closedAt: null, reason: 'Nombre De Alumno' },
      }),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledTimes(1);
    const logged = logError.mock.calls.flat().map(String).join(' ');
    expect(logged).toContain('academic.period.reopen');
    expect(logged).toContain('AcademicPeriod');
    expect(logged).toContain('p1');
    expect(logged).toContain('admin01');
    expect(logged).not.toContain('Nombre De Alumno');
    expect(logged).not.toContain('dato@correo.pe');
  });

  it('el servicio responde y publica el evento aunque la bitácora falle', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const db = activeYearWithClosedPeriod();
    const { periods, sink, publish } = makeServices(db);
    sink.write.mockRejectedValue(new Error('bitácora caída'));

    await expect(periods.reopen('p1', REASON, actor)).resolves.toMatchObject({ id: 'p1' });
    expect(db.period('p1')?.closedAt).toBeNull();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'period.reopened.v1' }));
  });
});
