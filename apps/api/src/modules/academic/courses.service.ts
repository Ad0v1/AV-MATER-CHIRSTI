import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { recordAcademic } from './academic-audit.js';
import type { CreateCourseDto, UpdateCourseDto } from './academic.dto.js';
import { MSG, mapPrismaError } from './academic.errors.js';
import { diffFields, hasChanges } from './academic.mappers.js';
import type { Actor } from './request-user.js';

export type CourseView = { id: string; name: string; isActive: boolean };

const toView = (c: CourseView): CourseView => ({ id: c.id, name: c.name, isActive: c.isActive });

const DUPLICATE = 'Ya existe un curso con ese nombre';

// RF-13: catálogo global de cursos.
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive: boolean): Promise<{ items: CourseView[]; total: number }> {
    const rows = await this.prisma.course.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
    const items = rows.map(toView);
    return { items, total: items.length };
  }

  async create(dto: CreateCourseDto, actor: Actor): Promise<CourseView> {
    const duplicate = await this.prisma.course.findUnique({
      where: { name: dto.name },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(DUPLICATE);

    const created = await this.prisma.course
      .create({ data: { name: dto.name } })
      .catch((e: unknown) => mapPrismaError(e, DUPLICATE));

    await recordAcademic(this.audit, actor, 'course.create', 'Course', created.id, {
      after: { name: created.name },
    });
    return toView(created);
  }

  async update(id: string, dto: UpdateCourseDto, actor: Actor): Promise<CourseView> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException(MSG.courseNotFound);
    const diff = diffFields(course, { name: dto.name, isActive: dto.isActive });
    if (!hasChanges(diff)) return toView(course);

    const updated = await this.prisma.course
      .update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } })
      .catch((e: unknown) => mapPrismaError(e, DUPLICATE));

    await recordAcademic(this.audit, actor, 'course.update', 'Course', id, diff);
    return toView(updated);
  }
}
