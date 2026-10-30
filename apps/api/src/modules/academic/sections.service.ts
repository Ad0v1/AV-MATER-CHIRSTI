import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { recordAcademic } from './academic-audit.js';
import { AcademicAccessService } from './academic-access.service.js';
import type { CreateSectionDto, UpdateSectionDto } from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import { diffFields, hasChanges } from './academic.mappers.js';
import type { Actor } from './request-user.js';

export type SectionView = {
  id: string;
  academicYearId: string;
  gradeLevel: number;
  code: string;
  isActive: boolean;
};

const toView = (s: SectionView): SectionView => ({
  id: s.id,
  academicYearId: s.academicYearId,
  gradeLevel: s.gradeLevel,
  code: s.code,
  isActive: s.isActive,
});

const DUPLICATE = 'Ya existe esa sección en el año';

@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
  ) {}

  async list(academicYearId: string): Promise<{ items: SectionView[]; total: number }> {
    await this.findYear(academicYearId);
    const rows = await this.prisma.section.findMany({
      where: { academicYearId },
      orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
    });
    const items = rows.map(toView);
    return { items, total: items.length };
  }

  // RF-12: sección (grado 1..5 + código) en un año editable.
  async create(academicYearId: string, dto: CreateSectionDto, actor: Actor): Promise<SectionView> {
    const year = await this.findYear(academicYearId);
    if (await this.access.isYearReadOnly(year)) throw new ConflictException(MSG.readOnlyYear);
    const duplicate = await this.prisma.section.findFirst({
      where: { academicYearId, gradeLevel: dto.gradeLevel, code: dto.code },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(DUPLICATE);

    const created = await this.prisma.section
      .create({ data: { academicYearId, gradeLevel: dto.gradeLevel, code: dto.code } })
      .catch((e: unknown) => mapPrismaError(e, DUPLICATE));

    await recordAcademic(this.audit, actor, 'section.create', 'Section', created.id, {
      after: { academicYearId, gradeLevel: created.gradeLevel, code: created.code },
    });
    return toView(created);
  }

  // El grado no cambia; desactivar exige que no haya matrículas vigentes.
  async update(id: string, dto: UpdateSectionDto, actor: Actor): Promise<SectionView> {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { academicYear: true },
    });
    if (!section) throw new NotFoundException(MSG.sectionNotFound);
    const diff = diffFields(section, { code: dto.code, isActive: dto.isActive });
    if (!hasChanges(diff)) return toView(section);
    if (await this.access.isYearReadOnly(section.academicYear)) {
      throw new ConflictException(MSG.readOnlyYear);
    }
    if (dto.isActive === false && section.isActive) {
      const current = await this.prisma.enrollment.count({
        where: { sectionId: id, isCurrent: true },
      });
      if (current > 0) {
        throw new ConflictException('La sección tiene matrículas vigentes');
      }
    }
    if (dto.code !== undefined && dto.code !== section.code) {
      const duplicate = await this.prisma.section.findFirst({
        where: {
          academicYearId: section.academicYearId,
          gradeLevel: section.gradeLevel,
          code: dto.code,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException(DUPLICATE);
    }

    const updated = await this.prisma.section
      .update({ where: { id }, data: { code: dto.code, isActive: dto.isActive } })
      .catch((e: unknown) => mapPrismaError(e, DUPLICATE));

    await recordAcademic(this.audit, actor, 'section.update', 'Section', id, diff);
    return toView(updated);
  }

  private async findYear(id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException(MSG.yearNotFound);
    return year;
  }
}
