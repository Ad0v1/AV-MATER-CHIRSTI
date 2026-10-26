import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { recordAcademic } from './academic-audit.js';
import { lockAcademicYear } from './academic-locks.js';
import { AcademicEventPublisher } from './academic-events.js';
import { AcademicAccessService, toPeriodView, type PeriodView } from './academic-access.service.js';
import type { CreateYearDto, UpdateYearDto } from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import { fromDateOnly, marker, toDateOnly, toIso } from './academic.mappers.js';
import {
  PERIOD_LABELS,
  isYearReadOnly,
  periodKindFor,
  shiftDateToYear,
  validatePeriodDates,
  type PeriodDates,
} from './academic-policy.js';
import type { Actor } from './request-user.js';

export type YearSummary = {
  id: string;
  year: number;
  isActive: boolean;
  closedAt: string | null;
  readOnly: boolean;
};

export type YearDetail = YearSummary & { periods: PeriodView[] };

type YearRow = { id: string; year: number; isActive: boolean | null; closedAt: Date | null };

const toSummary = (year: YearRow, activeYear: { year: number } | null): YearSummary => ({
  id: year.id,
  year: year.year,
  isActive: marker(year.isActive),
  closedAt: toIso(year.closedAt),
  readOnly: isYearReadOnly(year, activeYear),
});

const periodsInclude = { periods: { orderBy: { sequence: 'asc' as const } } };

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: AcademicEventPublisher,
    private readonly access: AcademicAccessService,
  ) {}

  async list(): Promise<{ items: YearSummary[]; total: number }> {
    const years = await this.prisma.academicYear.findMany({ orderBy: { year: 'desc' } });
    const active = years.find((y) => y.isActive === true) ?? null;
    const items = years.map((y) => toSummary(y, active));
    return { items, total: items.length };
  }

  async get(id: string): Promise<YearDetail> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: periodsInclude,
    });
    if (!year) throw new NotFoundException(MSG.yearNotFound);
    return this.toDetail(year);
  }

  // RF-09: año (no activo) con sus 4 períodos, en una sola escritura anidada (atómica).
  async create(dto: CreateYearDto, actor: Actor): Promise<YearDetail> {
    const issues = validatePeriodDates(dto.year, dto.periods);
    if (issues.length > 0) throw new UnprocessableEntityException({ message: issues });
    const exists = await this.prisma.academicYear.findUnique({ where: { year: dto.year } });
    if (exists) throw new ConflictException('El año académico ya existe');

    const periods = [...dto.periods].sort((a, b) => a.sequence - b.sequence);
    const created = await this.prisma.academicYear
      .create({
        data: {
          year: dto.year,
          isActive: null,
          periods: {
            create: periods.map((p) => {
              const kind = periodKindFor(p.sequence);
              return {
                sequence: p.sequence,
                kind,
                label: PERIOD_LABELS[kind],
                startDate: fromDateOnly(p.startDate),
                endDate: fromDateOnly(p.endDate),
              };
            }),
          },
        },
        include: periodsInclude,
      })
      .catch((e: unknown) => mapPrismaError(e, 'El año académico ya existe'));

    await recordAcademic(this.audit, actor, 'year.create', 'AcademicYear', created.id, {
      after: { year: created.year, periods },
    });
    return this.toDetail(created);
  }

  // Solo un año editable, no activo y sin secciones; las fechas de los períodos se mueven al nuevo año.
  async update(id: string, dto: UpdateYearDto, actor: Actor): Promise<YearDetail> {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: { ...periodsInclude, _count: { select: { sections: true } } },
    });
    if (!year) throw new NotFoundException(MSG.yearNotFound);
    if (dto.year === year.year) return this.toDetail(year);
    if (isYearReadOnly(year, await this.access.getActiveYear())) {
      throw new ConflictException(MSG.readOnlyYear);
    }
    if (year.isActive === true) {
      throw new ConflictException('No se puede cambiar el número del año activo');
    }
    if (year._count.sections > 0) {
      throw new ConflictException('No se puede cambiar el número de un año con secciones');
    }
    if (await this.prisma.academicYear.findUnique({ where: { year: dto.year } })) {
      throw new ConflictException('El año académico ya existe');
    }

    const shifted: PeriodDates[] = [];
    for (const p of year.periods) {
      const startDate = shiftDateToYear(toDateOnly(p.startDate), dto.year);
      const endDate = shiftDateToYear(toDateOnly(p.endDate), dto.year);
      if (!startDate || !endDate) {
        throw new UnprocessableEntityException({
          message: [
            { path: `periods.${p.sequence}`, message: 'La fecha no existe en el nuevo año' },
          ],
        });
      }
      shifted.push({ sequence: p.sequence, startDate, endDate });
    }
    const issues = validatePeriodDates(dto.year, shifted);
    if (issues.length > 0) throw new UnprocessableEntityException({ message: issues });

    const updated = await this.prisma
      .$transaction(async (tx) => {
        await tx.academicYear.update({ where: { id }, data: { year: dto.year } });
        for (const [i, p] of year.periods.entries()) {
          await tx.academicPeriod.update({
            where: { id: p.id },
            data: {
              startDate: fromDateOnly(shifted[i].startDate),
              endDate: fromDateOnly(shifted[i].endDate),
            },
          });
        }
        return tx.academicYear.findUniqueOrThrow({ where: { id }, include: periodsInclude });
      })
      .catch((e: unknown) => mapPrismaError(e, 'El año académico ya existe'));

    await recordAcademic(this.audit, actor, 'year.update', 'AcademicYear', id, {
      before: { year: year.year },
      after: { year: dto.year },
    });
    return this.toDetail(updated);
  }

  // RN-11: un solo año activo. El anterior pasa a NULL (nunca FALSE) en la misma transacción.
  // Orden dentro de la transacción (nunca hay dos TRUE a la vez para el UNIQUE del marcador):
  // 1) se desactiva el activo actual; 2) se activa el pedido solo si sigue sin cerrar
  // (updateMany condicionado, lectura actual con bloqueo de fila). Si el año se cerró entretanto,
  // count = 0 → 409 lanzado dentro de la callback: rollback y el anterior sigue activo.
  async activate(id: string, actor: Actor): Promise<YearDetail> {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException(MSG.yearNotFound);
    if (year.closedAt !== null) throw new ConflictException(MSG.yearClosed);
    if (year.isActive === true) return this.get(id);

    const previous = await this.prisma
      .$transaction(async (tx) => {
        const prev = await tx.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        });
        await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: null } });
        const { count } = await tx.academicYear.updateMany({
          where: { id, closedAt: null },
          data: { isActive: true },
        });
        if (count === 0) throw new ConflictException(MSG.yearClosed);
        return prev;
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.conflict));

    // Si otra petición lo activó entretanto, sigue activo y no hay cambio que registrar.
    if (previous?.id === id) return this.get(id);
    if (previous) {
      await recordAcademic(this.audit, actor, 'year.deactivate', 'AcademicYear', previous.id, {
        before: { isActive: true },
        after: { isActive: false },
      });
    }
    await recordAcademic(this.audit, actor, 'year.activate', 'AcademicYear', id, {
      before: { isActive: false },
      after: { isActive: true },
    });
    return this.get(id);
  }

  // RF-17: cerrar exige todos los períodos cerrados; el año queda inactivo (NULL) y de solo lectura.
  // En una transacción con la fila del año bloqueada (igual que reabrir período): se cuentan los
  // períodos abiertos y se cierra con updateMany condicionado (409 si ya estaba cerrado).
  async close(id: string, actor: Actor): Promise<YearDetail> {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException(MSG.yearNotFound);
    if (year.closedAt !== null) throw new ConflictException(MSG.yearAlreadyClosed);

    const closedAt = new Date();
    const wasActive = await this.prisma
      .$transaction(async (tx) => {
        if (!(await lockAcademicYear(tx, id))) throw new NotFoundException(MSG.yearNotFound);
        const openPeriods = await tx.academicPeriod.count({
          where: { academicYearId: id, closedAt: null },
        });
        if (openPeriods > 0) {
          throw new UnprocessableEntityException(
            'Cierra todos los períodos antes de cerrar el año',
          );
        }
        const current = await tx.academicYear.findUnique({
          where: { id },
          select: { isActive: true },
        });
        const { count } = await tx.academicYear.updateMany({
          where: { id, closedAt: null },
          data: { closedAt, isActive: null },
        });
        if (count === 0) throw new ConflictException(MSG.yearAlreadyClosed);
        return current?.isActive === true;
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.conflict));

    const before: Record<string, unknown> = { closedAt: null };
    const after: Record<string, unknown> = { closedAt: closedAt.toISOString() };
    if (wasActive) {
      before.isActive = true;
      after.isActive = false;
    }
    await recordAcademic(this.audit, actor, 'year.close', 'AcademicYear', id, { before, after });
    this.events.publish({
      type: 'academic-year.closed.v1',
      payload: { academicYearId: id, year: year.year, closedAt: closedAt.toISOString() },
    });
    return this.get(id);
  }

  private async toDetail(
    year: YearRow & { periods: Parameters<typeof toPeriodView>[0][] },
  ): Promise<YearDetail> {
    const active = year.isActive === true ? year : await this.access.getActiveYear();
    return {
      ...toSummary(year, active),
      periods: year.periods.map((p) => toPeriodView(p, year)),
    };
  }
}
