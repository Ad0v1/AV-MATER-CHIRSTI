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
import type { ClosePeriodDto, ReopenPeriodDto, UpdatePeriodDto } from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import { diffFields, fromDateOnly, hasChanges, toDateOnly } from './academic.mappers.js';
import { isYearReadOnly, validatePeriodDates } from './academic-policy.js';
import type { Actor } from './request-user.js';

@Injectable()
export class AcademicPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: AcademicEventPublisher,
    private readonly access: AcademicAccessService,
  ) {}

  // RF-10: fechas de un período abierto de un año editable.
  async update(id: string, dto: UpdatePeriodDto, actor: Actor): Promise<PeriodView> {
    const period = await this.findWithYear(id);
    const year = period.academicYear;
    await this.assertYearWritable(year);
    if (period.closedAt !== null) throw new ConflictException('El período está cerrado');

    const before = { startDate: toDateOnly(period.startDate), endDate: toDateOnly(period.endDate) };
    const after = {
      startDate: dto.startDate ?? before.startDate,
      endDate: dto.endDate ?? before.endDate,
    };
    const diff = diffFields(before, after);
    if (!hasChanges(diff)) return toPeriodView(period, year);

    const siblings = await this.prisma.academicPeriod.findMany({
      where: { academicYearId: year.id },
    });
    const issues = validatePeriodDates(
      year.year,
      siblings.map((p) =>
        p.id === id
          ? { sequence: p.sequence, ...after }
          : {
              sequence: p.sequence,
              startDate: toDateOnly(p.startDate),
              endDate: toDateOnly(p.endDate),
            },
      ),
    );
    if (issues.length > 0) throw new UnprocessableEntityException({ message: issues });

    const updated = await this.prisma.academicPeriod
      .update({
        where: { id },
        data: { startDate: fromDateOnly(after.startDate), endDate: fromDateOnly(after.endDate) },
      })
      .catch((e: unknown) => mapPrismaError(e));

    await recordAcademic(this.audit, actor, 'period.update', 'AcademicPeriod', id, diff);
    return toPeriodView(updated, year);
  }

  // RF-11: cierre de período (el motivo es opcional y va a la bitácora).
  async close(id: string, dto: ClosePeriodDto, actor: Actor): Promise<PeriodView> {
    const period = await this.findWithYear(id);
    const year = period.academicYear;
    if (period.closedAt !== null) throw new ConflictException('El período ya está cerrado');
    await this.assertYearWritable(year);

    const closedAt = new Date();
    const { count } = await this.prisma.academicPeriod.updateMany({
      where: { id, closedAt: null },
      data: { closedAt },
    });
    if (count === 0) throw new ConflictException('El período ya está cerrado');

    const after: Record<string, unknown> = { closedAt: closedAt.toISOString() };
    if (dto.reason) after.reason = dto.reason;
    await recordAcademic(this.audit, actor, 'period.close', 'AcademicPeriod', id, {
      before: { closedAt: null },
      after,
    });
    this.events.publish({
      type: 'period.closed.v1',
      payload: { periodId: id, academicYearId: year.id, closedAt: closedAt.toISOString() },
    });
    return toPeriodView({ ...period, closedAt }, year);
  }

  // RF-11 / RN-10: reapertura con motivo obligatorio, solo en el año activo y sin cerrar.
  async reopen(id: string, dto: ReopenPeriodDto, actor: Actor): Promise<PeriodView> {
    const period = await this.findWithYear(id);
    const year = period.academicYear;
    if (period.closedAt === null) throw new ConflictException('El período no está cerrado');
    if (year.isActive !== true || year.closedAt !== null) {
      throw new ConflictException(MSG.reopenOnlyActiveYear);
    }

    // Misma comprobación dentro de la transacción, con la fila del año bloqueada (igual que
    // cerrar año): así un cierre de año concurrente no deja un período abierto en un año cerrado.
    await this.prisma
      .$transaction(async (tx) => {
        if (!(await lockAcademicYear(tx, year.id))) throw new NotFoundException(MSG.yearNotFound);
        const current = await tx.academicYear.findUnique({
          where: { id: year.id },
          select: { isActive: true, closedAt: true },
        });
        if (current?.isActive !== true || current.closedAt !== null) {
          throw new ConflictException(MSG.reopenOnlyActiveYear);
        }
        const { count } = await tx.academicPeriod.updateMany({
          where: {
            id,
            closedAt: { not: null },
            academicYear: { isActive: true, closedAt: null },
          },
          data: { closedAt: null },
        });
        if (count === 0) throw new ConflictException('El período no está cerrado');
      })
      .catch((e: unknown) => mapPrismaError(e, MSG.conflict));

    const reopenedAt = new Date();
    await recordAcademic(this.audit, actor, 'period.reopen', 'AcademicPeriod', id, {
      before: { closedAt: period.closedAt.toISOString() },
      after: { closedAt: null, reason: dto.reason },
    });
    this.events.publish({
      type: 'period.reopened.v1',
      payload: { periodId: id, academicYearId: year.id, reopenedAt: reopenedAt.toISOString() },
    });
    return toPeriodView({ ...period, closedAt: null }, year);
  }

  private async findWithYear(id: string) {
    const period = await this.prisma.academicPeriod.findUnique({
      where: { id },
      include: { academicYear: true },
    });
    if (!period) throw new NotFoundException(MSG.periodNotFound);
    return period;
  }

  private async assertYearWritable(year: {
    year: number;
    isActive: boolean | null;
    closedAt: Date | null;
  }): Promise<void> {
    const active = year.isActive === true ? year : await this.access.getActiveYear();
    if (isYearReadOnly(year, active)) throw new ConflictException(MSG.readOnlyYear);
  }
}
