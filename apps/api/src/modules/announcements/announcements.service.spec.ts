import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import { AnnouncementEventPublisher } from './announcements-events.js';
import { AnnouncementsService, reaches } from './announcements.service.js';

const YEAR = 'year-1';
const teacher = { id: 'teacher-1', role: 'TEACHER' as const };
const otherTeacher = { id: 'teacher-2', role: 'TEACHER' as const };
const admin = { id: 'admin-1', role: 'ADMIN' as const };
const actor = { id: 'x', ip: '127.0.0.1' };
const SECRET_BODY = 'Cuerpo privado con datos';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  academicYearId: YEAR,
  scope: 'COURSE_SECTION',
  gradeLevel: null,
  courseSectionId: 'cs-1',
  title: 'Título',
  body: SECRET_BODY,
  authorId: teacher.id,
  publishedAt: new Date('2026-05-01T10:00:00Z'),
  updatedAt: new Date('2026-05-01T10:00:00Z'),
  courseSection: {
    course: { id: 'c-1', name: 'Matemática' },
    section: { gradeLevel: 3, code: 'A' },
  },
  ...over,
});

function setup(
  opts: { current?: unknown; linked?: string[]; status?: string; closed?: boolean } = {},
) {
  const prisma = {
    announcement: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          row({ ...data, courseSection: data.courseSectionId ? row().courseSection : null }),
        ),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve(
          opts.current === undefined
            ? {
                id: 'ann-1',
                scope: 'COURSE_SECTION',
                title: 'Título',
                body: SECRET_BODY,
                authorId: teacher.id,
                courseSectionId: 'cs-1',
                academicYear: { isActive: true, closedAt: opts.closed ? new Date() : null },
              }
            : opts.current,
        ),
      ),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(row({ title: 'Nuevo' }))),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      count: vi.fn(() => Promise.resolve(1)),
      findMany: vi.fn(() => Promise.resolve([row()])),
    },
    courseSection: {
      findUnique: vi.fn(() => Promise.resolve({ id: 'cs-1' })),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ section: { academicYearId: YEAR } })),
      findMany: vi.fn(() => Promise.resolve([{ id: 'cs-1', sectionId: 'sec-1' }])),
    },
    academicYear: { findUnique: vi.fn(() => Promise.resolve({ closedAt: null })) },
    enrollment: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            sectionId: 'sec-1',
            section: { gradeLevel: 3 },
            student: { id: 'st-1', fullName: 'Ana' },
          },
        ]),
      ),
    },
    user: { findUnique: vi.fn(() => Promise.resolve({ status: opts.status ?? 'ACTIVE' })) },
  };
  const access = {
    getActiveYear: vi.fn(() => Promise.resolve({ id: YEAR, year: 2026 })),
    assertTeacherOf: vi.fn((userId: string) =>
      userId === teacher.id ? Promise.resolve() : Promise.reject(new ForbiddenException()),
    ),
    assertCourseSectionWritable: vi.fn(() => Promise.resolve()),
    getLinkedStudentIds: vi.fn(() => Promise.resolve(opts.linked ?? ['st-1'])),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const events = new AnnouncementEventPublisher();
  const published: unknown[] = [];
  events.on('announcement.published.v1', (e) => {
    published.push(e.payload);
  });
  const service = new AnnouncementsService(
    prisma as unknown as PrismaService,
    access as unknown as AcademicAccessService,
    audit as unknown as AuditService,
    events,
  );
  return { service, prisma, access, audit, published };
}

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
  throw new Error('no lanzó');
};

describe('AnnouncementsService (RF-32)', () => {
  it('el docente asignado publica: bitácora sin cuerpo ni título y evento solo con ids', async () => {
    const { service, audit, published } = setup();
    const view = await service.createForCourseSection(teacher, actor, 'cs-1', {
      title: 'Título',
      body: SECRET_BODY,
    });
    expect(view).toMatchObject({ scope: 'COURSE_SECTION', canEdit: true, edited: false });
    expect(view).not.toHaveProperty('authorId');
    expect(audit.record).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(audit.record.mock.calls);
    expect(logged).not.toContain(SECRET_BODY);
    expect(logged).not.toContain('Título');
    expect(published).toEqual([
      {
        announcementId: 'ann-1',
        academicYearId: YEAR,
        scope: 'COURSE_SECTION',
        gradeLevel: null,
        courseSectionId: 'cs-1',
        publishedAt: '2026-05-01T10:00:00.000Z',
      },
    ]);
  });

  it('otro docente no publica en el curso (403) y no se crea nada', async () => {
    const { service, prisma } = setup();
    expect(
      await statusOf(
        service.createForCourseSection(otherTeacher, actor, 'cs-1', { title: 't', body: 'b' }),
      ),
    ).toBe(403);
    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('ADMIN publica en un curso inexistente → 404', async () => {
    const { service, prisma } = setup();
    prisma.courseSection.findUnique.mockResolvedValueOnce(null as never);
    expect(
      await statusOf(
        service.createForCourseSection(admin, actor, 'cs-x', { title: 't', body: 'b' }),
      ),
    ).toBe(404);
  });

  it('INSTITUTION sin año activo → 409; año cerrado → 409', async () => {
    const a = setup();
    a.access.getActiveYear.mockResolvedValueOnce(null as never);
    expect(
      await statusOf(
        a.service.createInstitutional(admin, actor, {
          scope: 'INSTITUTION',
          title: 't',
          body: 'b',
        }),
      ),
    ).toBe(409);
    const b = setup();
    b.prisma.academicYear.findUnique.mockResolvedValueOnce({ closedAt: new Date() });
    expect(
      await statusOf(
        b.service.createInstitutional(admin, actor, {
          scope: 'INSTITUTION',
          title: 't',
          body: 'b',
        }),
      ),
    ).toBe(409);
  });

  it('GRADE guarda el grado y publica el evento', async () => {
    const { service, prisma, published } = setup();
    await service.createInstitutional(admin, actor, {
      scope: 'GRADE',
      gradeLevel: 4,
      title: 't',
      body: 'b',
    });
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scope: 'GRADE', gradeLevel: 4, authorId: admin.id }),
      }),
    );
    expect(published).toHaveLength(1);
  });

  it('PATCH: solo autor o ADMIN; no vuelve a publicar; bitácora con campos cambiados', async () => {
    const { service, audit, published } = setup();
    await service.update(teacher, actor, 'ann-1', { title: 'Nuevo', body: SECRET_BODY });
    expect(published).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'announcement.update',
        afterState: { scope: 'COURSE_SECTION', changedFields: ['title'] },
      }),
    );
    expect(await statusOf(service.update(otherTeacher, actor, 'ann-1', { title: 'x' }))).toBe(403);
    await expect(service.update(admin, actor, 'ann-1', { title: 'y' })).resolves.toBeDefined();
  });

  it('PATCH sin cambios reales no escribe ni deja bitácora', async () => {
    const { service, prisma, audit } = setup();
    await service.update(teacher, actor, 'ann-1', { title: 'Título' });
    expect(prisma.announcement.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('el autor docente que ya no tiene el curso no edita (403)', async () => {
    const { service, access } = setup();
    access.assertTeacherOf.mockRejectedValueOnce(new ForbiddenException());
    expect(await statusOf(service.update(teacher, actor, 'ann-1', { title: 'x' }))).toBe(403);
  });

  it('DELETE: borrado lógico con deletedById; retirado o inexistente → 404; año cerrado → 409', async () => {
    const { service, prisma, audit } = setup();
    await service.remove(teacher, actor, 'ann-1');
    expect(prisma.announcement.updateMany).toHaveBeenCalledWith({
      where: { id: 'ann-1', deletedAt: null },
      data: { deletedAt: expect.any(Date), deletedById: teacher.id },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'announcement.delete' }),
    );
    const gone = setup({ current: null });
    await expect(gone.service.remove(admin, actor, 'ann-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const closed = setup({ closed: true });
    expect(await statusOf(closed.service.remove(admin, actor, 'ann-1'))).toBe(409);
  });

  it('DELETE concurrente (ya retirado entre lectura y escritura) → 404', async () => {
    const { service, prisma } = setup();
    prisma.announcement.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await statusOf(service.remove(admin, actor, 'ann-1'))).toBe(404);
  });

  it('/me: studentId solo para GUARDIAN (400); apoderado con estudiante ajeno → 403', async () => {
    const { service } = setup();
    expect(
      await statusOf(
        service.listMine({ id: 'st-1', role: 'STUDENT' }, { page: 1, studentId: 'st-9' }),
      ),
    ).toBe(400);
    expect(
      await statusOf(
        service.listMine({ id: 'g-1', role: 'GUARDIAN' }, { page: 1, studentId: 'st-9' }),
      ),
    ).toBe(403);
  });

  it('/me: usuario no ACTIVE → 403', async () => {
    const { service } = setup({ status: 'INACTIVE' });
    expect(await statusOf(service.listMine({ id: 'st-1', role: 'STUDENT' }, { page: 1 }))).toBe(
      403,
    );
  });

  it('/me STUDENT: filtra por INSTITUTION, su grado y sus cursos-sección del año activo', async () => {
    const { service, prisma } = setup();
    const page = await service.listMine({ id: 'st-1', role: 'STUDENT' }, { page: 1 });
    expect(page.items[0].canEdit).toBe(false);
    expect(page.items[0]).not.toHaveProperty('students');
    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academicYearId: YEAR,
          deletedAt: null,
          OR: [
            { scope: 'INSTITUTION' },
            { scope: 'GRADE', gradeLevel: { in: [3] } },
            { scope: 'COURSE_SECTION', courseSectionId: { in: ['cs-1'] } },
          ],
        },
        take: 20,
        skip: 0,
      }),
    );
  });

  it('/me GUARDIAN sin estudiantes vinculados → vacío, sin consultar anuncios', async () => {
    const { service, prisma } = setup({ linked: [] });
    const page = await service.listMine({ id: 'g-1', role: 'GUARDIAN' }, { page: 1 });
    expect(page).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    expect(prisma.announcement.findMany).not.toHaveBeenCalled();
  });

  it('/me GUARDIAN: cada anuncio indica solo a sus estudiantes alcanzados', async () => {
    const { service } = setup();
    const page = await service.listMine({ id: 'g-1', role: 'GUARDIAN' }, { page: 1 });
    expect(page.items[0].students).toEqual([{ id: 'st-1', fullName: 'Ana' }]);
  });

  it('reaches: INSTITUTION a todos, GRADE por grado y COURSE_SECTION por curso', () => {
    const s = { gradeLevel: 3, courseSectionIds: new Set(['cs-1']) };
    expect(reaches({ scope: 'INSTITUTION', gradeLevel: null, courseSectionId: null }, s)).toBe(
      true,
    );
    expect(reaches({ scope: 'GRADE', gradeLevel: 3, courseSectionId: null }, s)).toBe(true);
    expect(reaches({ scope: 'GRADE', gradeLevel: 4, courseSectionId: null }, s)).toBe(false);
    expect(reaches({ scope: 'COURSE_SECTION', gradeLevel: null, courseSectionId: 'cs-2' }, s)).toBe(
      false,
    );
  });

  it('listForCourseSection: estudiante → 403', async () => {
    const { service } = setup();
    expect(
      await statusOf(
        service.listForCourseSection({ id: 'st-1', role: 'STUDENT' }, 'cs-1', { page: 1 }),
      ),
    ).toBe(403);
  });
});
