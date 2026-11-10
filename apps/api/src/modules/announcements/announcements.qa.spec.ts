import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  type Type,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../common/audit/audit.service.js';
import { RolesGuard } from '../../common/auth/roles.guard.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import {
  AnnouncementsController,
  CourseSectionAnnouncementsController,
  MeAnnouncementsController,
} from './announcements.controller.js';
import {
  adminAnnouncementSchema,
  courseAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcements.dto.js';
import { AnnouncementEventPublisher } from './announcements-events.js';
import { AnnouncementsService } from './announcements.service.js';

// QA de 5d (RF-32): permisos por rol y alcance, límites de título, HTML como texto y borrado lógico.

const actor = { id: 'x', ip: '127.0.0.1' };
const role = (r: 'STUDENT' | 'TEACHER' | 'GUARDIAN' | 'ADMIN', id = `${r}-1`) => ({ id, role: r });

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
  throw new Error('no lanzó');
};

/** Ejecuta RolesGuard contra un método de un controlador, como lo haría Nest. */
function guardStatus(
  controller: Type<unknown>,
  method: string,
  user: { id: string; role: string } | undefined,
): number {
  const handler = (controller.prototype as Record<string, () => unknown>)[method];
  const ctx = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  try {
    new RolesGuard(new Reflector()).canActivate(ctx);
    return 200;
  } catch (error) {
    if (error instanceof ForbiddenException) return 403;
    if (error instanceof UnauthorizedException) return 401;
    throw error;
  }
}

describe('RF-32: permisos por rol (RolesGuard sobre los controladores)', () => {
  const roles = ['STUDENT', 'GUARDIAN', 'TEACHER', 'ADMIN'] as const;
  const matrix: [Type<unknown>, string, string[]][] = [
    [CourseSectionAnnouncementsController, 'create', ['TEACHER', 'ADMIN']],
    [CourseSectionAnnouncementsController, 'list', ['TEACHER', 'ADMIN']],
    [AnnouncementsController, 'create', ['ADMIN']],
    [AnnouncementsController, 'list', ['ADMIN']],
    [AnnouncementsController, 'update', ['TEACHER', 'ADMIN']],
    [AnnouncementsController, 'remove', ['TEACHER', 'ADMIN']],
    [MeAnnouncementsController, 'list', ['STUDENT', 'TEACHER', 'GUARDIAN']],
  ];

  for (const [controller, method, allowed] of matrix) {
    it(`RF-32: ${controller.name}.${method} permite solo ${allowed.join(', ')}`, () => {
      for (const r of roles) {
        const expected = allowed.includes(r) ? 200 : 403;
        expect(guardStatus(controller, method, role(r)), `${r}`).toBe(expected);
      }
      expect(guardStatus(controller, method, undefined)).toBe(401);
    });
  }
});

describe('RF-32: título de 150 vs 151 y cuerpo con HTML', () => {
  const edge = (n: number) => 'a'.repeat(n);

  it('RF-32: 150 caracteres pasa y 151 falla en crear de curso, ADMIN (ambos alcances) y PATCH', () => {
    expect(courseAnnouncementSchema.safeParse({ title: edge(150), body: 'b' }).success).toBe(true);
    expect(courseAnnouncementSchema.safeParse({ title: edge(151), body: 'b' }).success).toBe(false);
    for (const extra of [
      { scope: 'INSTITUTION' },
      { scope: 'GRADE', level: 'PRIMARIA', gradeLevel: 2 },
    ]) {
      expect(
        adminAnnouncementSchema.safeParse({ ...extra, title: edge(150), body: 'b' }).success,
      ).toBe(true);
      expect(
        adminAnnouncementSchema.safeParse({ ...extra, title: edge(151), body: 'b' }).success,
      ).toBe(false);
    }
    expect(updateAnnouncementSchema.safeParse({ title: edge(150) }).success).toBe(true);
    expect(updateAnnouncementSchema.safeParse({ title: edge(151) }).success).toBe(false);
  });

  it('RF-32: el recorte ocurre antes de contar (150 + espacios pasa); 150 con tilde cuenta por carácter', () => {
    expect(
      courseAnnouncementSchema.safeParse({ title: `  ${edge(150)}  `, body: 'b' }).success,
    ).toBe(true);
    expect(courseAnnouncementSchema.safeParse({ title: 'ñ'.repeat(150), body: 'b' }).success).toBe(
      true,
    );
  });

  it('RF-32: cuerpo de 5000 pasa y 5001 falla', () => {
    expect(courseAnnouncementSchema.safeParse({ title: 't', body: edge(5000) }).success).toBe(true);
    expect(courseAnnouncementSchema.safeParse({ title: 't', body: edge(5001) }).success).toBe(
      false,
    );
  });

  it('RF-32: el HTML del cuerpo y del título se conserva tal cual (texto, sin sanear ni interpretar)', () => {
    const html = '<img src=x onerror=alert(1)> <b>negrita</b> &amp; "comillas"';
    expect(courseAnnouncementSchema.parse({ title: '<h1>Hola</h1>', body: html })).toEqual({
      title: '<h1>Hola</h1>',
      body: html,
    });
  });

  it('RF-32: el servicio guarda el HTML tal cual y lo devuelve como texto en la vista', async () => {
    const { service, prisma } = build();
    const dto = courseAnnouncementSchema.parse({ title: '<b>t</b>', body: '<script>x()</script>' });
    const view = await service.createForCourseSection(
      role('TEACHER', 'teacher-1'),
      actor,
      'cs-1',
      dto,
    );
    const data = (
      prisma.announcement.create.mock.calls[0] as unknown as [{ data: { body: string } }]
    )[0].data;
    expect(data.body).toBe('<script>x()</script>');
    expect(view.body).toBe('<script>x()</script>');
    expect(view.title).toBe('<b>t</b>');
  });
});

const YEAR = 'year-1';
const annRow = (over: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  academicYearId: YEAR,
  scope: 'COURSE_SECTION',
  level: null,
  gradeLevel: null,
  courseSectionId: 'cs-1',
  title: 'T',
  body: 'B',
  authorId: 'teacher-1',
  publishedAt: new Date('2026-05-01T10:00:00Z'),
  updatedAt: new Date('2026-05-01T10:00:00Z'),
  courseSection: {
    course: { id: 'c', name: 'Mate' },
    section: { level: 'SECUNDARIA', gradeLevel: 3, code: 'A' },
  },
  ...over,
});

function build(opts: { linked?: string[]; current?: unknown } = {}) {
  const prisma = {
    announcement: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(annRow({ ...data })),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve(
          opts.current === undefined
            ? {
                id: 'ann-1',
                scope: 'COURSE_SECTION',
                title: 'T',
                body: 'B',
                authorId: 'teacher-1',
                courseSectionId: 'cs-1',
                academicYear: { isActive: true, closedAt: null },
              }
            : opts.current,
        ),
      ),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(annRow())),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      count: vi.fn(() => Promise.resolve(0)),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    courseSection: {
      findUnique: vi.fn(() => Promise.resolve({ id: 'cs-1' })),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ section: { academicYearId: YEAR } })),
      findMany: vi.fn(() =>
        Promise.resolve([
          { id: 'cs-1', sectionId: 'sec-1', section: { level: 'SECUNDARIA', gradeLevel: 3 } },
        ]),
      ),
    },
    academicYear: { findUnique: vi.fn(() => Promise.resolve({ closedAt: null })) },
    enrollment: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            sectionId: 'sec-1',
            section: { level: 'SECUNDARIA', gradeLevel: 3 },
            student: { id: 'st-1', fullName: 'Ana' },
          },
        ]),
      ),
    },
    user: { findUnique: vi.fn(() => Promise.resolve({ status: 'ACTIVE' })) },
  };
  const access = {
    getActiveYear: vi.fn(() => Promise.resolve({ id: YEAR, year: 2026 })),
    assertTeacherOf: vi.fn((userId: string) =>
      userId === 'teacher-1' ? Promise.resolve() : Promise.reject(new ForbiddenException()),
    ),
    assertCourseSectionWritable: vi.fn(() => Promise.resolve()),
    getLinkedStudentIds: vi.fn(() => Promise.resolve(opts.linked ?? ['st-1'])),
  };
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    access as unknown as AcademicAccessService,
    { record: vi.fn(() => Promise.resolve()) } as unknown as AuditService,
    new AnnouncementEventPublisher(),
  );
  return { service, prisma, access };
}

describe('RF-32: alcance y propiedad en el servicio', () => {
  const dto = { title: 't', body: 'b' };

  it('RF-32: STUDENT y GUARDIAN no crean ni listan en un curso (403) y no se escribe nada', async () => {
    const { service, prisma } = build();
    for (const r of ['STUDENT', 'GUARDIAN'] as const) {
      expect(await statusOf(service.createForCourseSection(role(r), actor, 'cs-1', dto))).toBe(403);
      expect(await statusOf(service.listForCourseSection(role(r), 'cs-1', { page: 1 }))).toBe(403);
    }
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('RF-32: docente ajeno no crea (403) ni lista el curso (403)', async () => {
    const { service, prisma } = build();
    const other = role('TEACHER', 'teacher-2');
    expect(await statusOf(service.createForCourseSection(other, actor, 'cs-1', dto))).toBe(403);
    expect(await statusOf(service.listForCourseSection(other, 'cs-1', { page: 1 }))).toBe(403);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('RF-32: un docente ajeno no edita ni retira el anuncio de otro (403); un STUDENT/GUARDIAN tampoco', async () => {
    const { service, prisma } = build();
    for (const u of [role('TEACHER', 'teacher-2'), role('STUDENT'), role('GUARDIAN')]) {
      expect(await statusOf(service.update(u, actor, 'ann-1', { title: 'x' }))).toBe(403);
      expect(await statusOf(service.remove(u, actor, 'ann-1'))).toBe(403);
    }
    expect(prisma.announcement.updateMany).not.toHaveBeenCalled();
  });

  it('RF-32: un docente no edita un anuncio institucional aunque figure como autor (courseSectionId null → 403)', async () => {
    const { service } = build({
      current: {
        id: 'ann-1',
        scope: 'INSTITUTION',
        title: 'T',
        body: 'B',
        authorId: 'teacher-1',
        courseSectionId: null,
        academicYear: { isActive: true, closedAt: null },
      },
    });
    expect(await statusOf(service.remove(role('TEACHER', 'teacher-1'), actor, 'ann-1'))).toBe(403);
  });

  it('RF-32: apoderado con studentId no vinculado → 403, sin consultar anuncios; vinculado → ok', async () => {
    const { service, prisma } = build({ linked: ['st-1'] });
    const guardian = role('GUARDIAN');
    expect(await statusOf(service.listMine(guardian, { page: 1, studentId: 'st-AJENO' }))).toBe(
      403,
    );
    expect(prisma.announcement.findMany).not.toHaveBeenCalled();
    await expect(service.listMine(guardian, { page: 1, studentId: 'st-1' })).resolves.toMatchObject(
      {
        total: 0,
      },
    );
  });

  it('RF-32: apoderado sin ningún vínculo con studentId → 403 (no ve nada)', async () => {
    const { service } = build({ linked: [] });
    expect(await statusOf(service.listMine(role('GUARDIAN'), { page: 1, studentId: 'st-1' }))).toBe(
      403,
    );
  });

  it('RF-32: ADMIN no tiene bandeja propia (403 en el servicio)', async () => {
    const { service } = build();
    expect(await statusOf(service.listMine(role('ADMIN'), { page: 1 }))).toBe(403);
  });

  it('RF-32: canEdit solo para el autor y ADMIN', async () => {
    const { service } = build();
    const asAuthor = await service.listForCourseSection(role('TEACHER', 'teacher-1'), 'cs-1', {
      page: 1,
    });
    expect(asAuthor.items).toEqual([]);
    const { service: s2, prisma } = build();
    prisma.announcement.findMany.mockResolvedValue([annRow()] as never);
    prisma.announcement.count.mockResolvedValue(1);
    const mine = await s2.listMine(role('STUDENT', 'st-1'), { page: 1 });
    expect(mine.items[0].canEdit).toBe(false);
    const asTeacher = await s2.listForCourseSection(role('TEACHER', 'teacher-1'), 'cs-1', {
      page: 1,
    });
    expect(asTeacher.items[0].canEdit).toBe(true);
    const asAdmin = await s2.listForCourseSection(role('ADMIN'), 'cs-1', { page: 1 });
    expect(asAdmin.items[0].canEdit).toBe(true);
  });
});

describe('RF-32 / RN-14: borrado lógico y paginación', () => {
  type FindArgs = { where: Record<string, unknown>; skip: number; take: number; orderBy: unknown };
  const lastFind = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.at(-1)?.[0] as FindArgs;

  it('RN-14: ningún listado devuelve anuncios retirados (deletedAt: null en todos)', async () => {
    const { service, prisma } = build();
    await service.listForCourseSection(role('ADMIN'), 'cs-1', { page: 1 });
    expect(lastFind(prisma.announcement.findMany).where.deletedAt).toBeNull();
    await service.listInstitutional(role('ADMIN'), { page: 1 });
    expect(lastFind(prisma.announcement.findMany).where.deletedAt).toBeNull();
    for (const r of ['STUDENT', 'TEACHER', 'GUARDIAN'] as const) {
      await service.listMine(role(r, r === 'TEACHER' ? 'teacher-1' : 'st-1'), { page: 1 });
      expect(lastFind(prisma.announcement.findMany).where.deletedAt, r).toBeNull();
    }
    // El total del paginador también excluye retirados.
    const counts = prisma.announcement.count.mock.calls.map(
      (c) => (c as unknown as [FindArgs])[0].where.deletedAt,
    );
    expect(counts.every((d) => d === null)).toBe(true);
  });

  it('RN-14: DELETE es lógico (updateMany con deletedAt y deletedById, nunca delete) y filtra deletedAt: null', async () => {
    const { service, prisma } = build();
    await service.remove(role('TEACHER', 'teacher-1'), actor, 'ann-1');
    const call = (
      prisma.announcement.updateMany.mock.calls[0] as unknown as [
        {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        },
      ]
    )[0];
    expect(call.where).toEqual({ id: 'ann-1', deletedAt: null });
    expect(call.data).toEqual({ deletedAt: expect.any(Date), deletedById: 'teacher-1' });
    expect('delete' in prisma.announcement).toBe(false);
  });

  it('RN-14: un anuncio retirado no se puede editar ni retirar otra vez (404)', async () => {
    const { service } = build({ current: null });
    expect(await statusOf(service.update(role('ADMIN'), actor, 'ann-1', { title: 'x' }))).toBe(404);
    expect(await statusOf(service.remove(role('ADMIN'), actor, 'ann-1'))).toBe(404);
  });

  it('RF-32: paginación de 20 en 20, más reciente primero; página 3 salta 40', async () => {
    const { service, prisma } = build();
    prisma.announcement.count.mockResolvedValue(45);
    const page = await service.listInstitutional(role('ADMIN'), { page: 3 });
    const args = lastFind(prisma.announcement.findMany);
    expect(args.skip).toBe(40);
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
    expect(page).toMatchObject({ page: 3, pageSize: 20, total: 45 });
  });

  it('RF-32: sin año activo, listInstitutional y listMine devuelven vacío', async () => {
    const { service, access } = build();
    access.getActiveYear.mockResolvedValue(null as never);
    expect(await service.listInstitutional(role('ADMIN'), { page: 2 })).toEqual({
      items: [],
      page: 2,
      pageSize: 20,
      total: 0,
    });
    expect((await service.listMine(role('STUDENT'), { page: 1 })).total).toBe(0);
  });

  it('RF-32: estudiante sin matrícula vigente solo ve INSTITUTION', async () => {
    const { service, prisma } = build();
    prisma.enrollment.findMany.mockResolvedValue([] as never);
    await service.listMine(role('STUDENT'), { page: 1 });
    expect(lastFind(prisma.announcement.findMany).where.OR).toEqual([{ scope: 'INSTITUTION' }]);
  });

  it('RF-32: el docente ve INSTITUTION, los grados que enseña y sus cursos', async () => {
    const { service, prisma } = build();
    prisma.courseSection.findMany.mockResolvedValue([
      { id: 'cs-1', section: { level: 'SECUNDARIA', gradeLevel: 2 } },
      { id: 'cs-2', section: { level: 'SECUNDARIA', gradeLevel: 2 } },
      { id: 'cs-3', section: { level: 'PRIMARIA', gradeLevel: 2 } },
    ] as never);
    await service.listMine(role('TEACHER', 'teacher-1'), { page: 1 });
    expect(lastFind(prisma.announcement.findMany).where.OR).toEqual([
      { scope: 'INSTITUTION' },
      { scope: 'GRADE', level: 'SECUNDARIA', gradeLevel: 2 },
      { scope: 'GRADE', level: 'PRIMARIA', gradeLevel: 2 },
      { scope: 'COURSE_SECTION', courseSectionId: { in: ['cs-1', 'cs-2', 'cs-3'] } },
    ]);
  });
});
