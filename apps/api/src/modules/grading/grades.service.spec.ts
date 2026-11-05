import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../common/audit/audit.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';
import type { SubmissionsReadService } from '../submissions/submissions-read.service.js';
import { GradingEventPublisher } from './grading-events.js';
import { GradesService } from './grades.service.js';

const A = '00000000-0000-7000-8000-00000000000a';
const E = '00000000-0000-7000-8000-00000000000e';
const CS = '00000000-0000-7000-8000-0000000000c5';
const teacher = { id: 'teacher', role: 'TEACHER' as const };
const actor = { id: 'teacher', ip: '127.0.0.1' };
const dec = (v: string) => ({ toFixed: (d: number) => Number(v).toFixed(d) });

function setup(
  opts: {
    hasSubmission?: boolean;
    existing?: Record<string, unknown> | null;
    sectionId?: string;
    periodClosed?: boolean;
    dueAt?: string;
    lockedEnrollment?: Record<string, unknown> | null;
  } = {},
) {
  const saved = (data: Record<string, unknown>) => ({
    id: 'g1',
    assignmentId: A,
    enrollmentId: E,
    comment: null,
    exemptionReason: null,
    gradedAt: new Date(),
    updatedAt: new Date(),
    ...data,
    value: data.value === null ? null : dec(data.value as string),
  });
  const tx = {
    // lockOpenPeriod (AcademicPeriod) y la relectura de la matrícula (Enrollment) usan $queryRaw.
    $queryRaw: vi.fn((sql: TemplateStringsArray) =>
      Promise.resolve(
        sql.join('?').includes('FROM Enrollment')
          ? opts.lockedEnrollment === null
            ? []
            : [
                opts.lockedEnrollment ?? {
                  sectionId: opts.sectionId ?? 'sec',
                  isCurrent: 1,
                  effectiveFrom: new Date('2026-03-01T00:00:00Z'),
                  effectiveTo: null,
                },
              ]
          : [{ closedAt: opts.periodClosed ? new Date() : null }],
      ),
    ),
    submission: {
      findFirst: vi.fn().mockResolvedValue(opts.hasSubmission === false ? null : { id: 's1' }),
    },
    grade: {
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(saved(data))),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(saved(data))),
    },
  };
  const prisma = {
    enrollment: {
      findUnique: vi.fn().mockResolvedValue({
        sectionId: opts.sectionId ?? 'sec',
        isCurrent: true,
        effectiveFrom: new Date('2026-03-01T00:00:00Z'),
        effectiveTo: null,
      }),
    },
    courseSection: { findUniqueOrThrow: vi.fn().mockResolvedValue({ sectionId: 'sec' }) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const access = {
    assertTeacherOf: vi.fn().mockResolvedValue(undefined),
    assertCanAccessCourseSection: vi.fn().mockResolvedValue(undefined),
    assertCourseSectionWritable: vi.fn().mockResolvedValue(undefined),
  };
  const submissions = {
    getAssignmentForGrading: vi.fn().mockResolvedValue({
      id: A,
      courseSectionId: CS,
      periodId: 'p1',
      dueAt: opts.dueAt ?? '2026-05-10T23:59:00.000Z',
      allowLate: false,
      noSubmissionGrade: '2.00',
    }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const events = new GradingEventPublisher();
  const published: unknown[] = [];
  events.on('grade.updated.v1', (e) => void published.push(e.payload));
  const service = new GradesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    access as unknown as AcademicAccessService,
    submissions as unknown as SubmissionsReadService,
    events,
  );
  return { service, tx, access, audit, published };
}

describe('GradesService.put', () => {
  beforeEach(() => vi.useRealTimers());

  it('RF-41: crea la nota, registra bitácora sin comentario y publica grade.updated.v1', async () => {
    const { service, tx, audit, published } = setup();
    const view = await service.put(
      A,
      E,
      { state: 'GRADED', value: '15.00', comment: 'Buen trabajo' },
      teacher,
      actor,
    );
    expect(view).toMatchObject({ state: 'GRADED', value: '15.00', source: 'MANUAL' });
    expect(tx.grade.create).toHaveBeenCalledOnce();
    const record = audit.record.mock.calls[0][0];
    expect(record).toMatchObject({ action: 'grading.grade.create', entityType: 'Grade' });
    expect(JSON.stringify(record)).not.toContain('Buen trabajo');
    expect(record.afterState.changedFields).toContain('comment');
    expect(published).toEqual([
      expect.objectContaining({ gradeId: 'g1', gradeStatus: 'GRADED', source: 'MANUAL' }),
    ]);
  });

  it('RF-45: reemplaza una NE AUTO por nota (update con before)', async () => {
    const { service, tx, audit } = setup({
      existing: {
        id: 'g1',
        assignmentId: A,
        enrollmentId: E,
        state: 'NE',
        value: dec('2'),
        comment: null,
        exemptionReason: null,
        source: 'AUTO',
        gradedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await service.put(A, E, { state: 'GRADED', value: '14.00', comment: null }, teacher, actor);
    expect(tx.grade.update).toHaveBeenCalledOnce();
    expect(audit.record.mock.calls[0][0]).toMatchObject({
      action: 'grading.grade.update',
      beforeState: { state: 'NE', value: '2.00', source: 'AUTO' },
    });
  });

  it('RF-41: sin cambios no escribe ni registra', async () => {
    const { service, tx, audit, published } = setup({
      existing: {
        id: 'g1',
        assignmentId: A,
        enrollmentId: E,
        state: 'GRADED',
        value: dec('14'),
        comment: null,
        exemptionReason: null,
        source: 'MANUAL',
        gradedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const view = await service.put(
      A,
      E,
      { state: 'GRADED', value: '14.00', comment: null },
      teacher,
      actor,
    );
    expect(view.value).toBe('14.00');
    expect(tx.grade.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(published).toEqual([]);
  });

  it('RF-41: 422 NO_SUBMISSION sin entrega', async () => {
    const { service } = setup({ hasSubmission: false });
    await expect(
      service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toMatchObject({ status: 422, response: { code: 'NO_SUBMISSION' } });
  });

  it('RF-45: 422 NOT_OVERDUE con NE antes del plazo', async () => {
    const { service } = setup({ hasSubmission: false, dueAt: '2999-01-01T00:00:00.000Z' });
    await expect(
      service.put(A, E, { state: 'NE', value: null, comment: null }, teacher, actor),
    ).rejects.toMatchObject({ response: { code: 'NOT_OVERDUE' } });
  });

  it('RN-12: 422 ENROLLMENT_OUT_OF_SECTION con matrícula de otra sección', async () => {
    const { service } = setup({ sectionId: 'otra' });
    await expect(
      service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toMatchObject({ response: { code: 'ENROLLMENT_OUT_OF_SECTION' } });
  });

  it('RN-10/RF-50: 409 si el período se cierra a la vez (bloqueo FOR SHARE)', async () => {
    const { service } = setup({ periodClosed: true });
    await expect(
      service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('RF-41: 403 si no es el docente asignado', async () => {
    const { service, access } = setup();
    access.assertTeacherOf.mockRejectedValue(new ForbiddenException());
    await expect(
      service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('RN-14 (INFORME 6, MEDIO 2): decide con la matrícula releída en la transacción', async () => {
    // Fuera de la transacción parecía vigente; dentro ya está cerrada por un traslado antes del plazo.
    const { service, tx } = setup({
      hasSubmission: false,
      lockedEnrollment: {
        sectionId: 'sec',
        isCurrent: null,
        effectiveFrom: new Date('2026-03-01T00:00:00Z'),
        effectiveTo: new Date('2026-04-01T00:00:00Z'),
      },
    });
    await expect(
      service.put(A, E, { state: 'NE', value: null, comment: null }, teacher, actor),
    ).rejects.toMatchObject({ response: { code: 'ENROLLMENT_NOT_ELIGIBLE' } });
    expect(tx.grade.create).not.toHaveBeenCalled();
  });

  it('RN-12: 404 si la matrícula desaparece y 422 si cambió de sección dentro de la transacción', async () => {
    const gone = setup({ lockedEnrollment: null });
    await expect(
      gone.service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toMatchObject({ status: 404 });
    const moved = setup({
      lockedEnrollment: {
        sectionId: 'otra',
        isCurrent: 1,
        effectiveFrom: new Date('2026-03-01T00:00:00Z'),
        effectiveTo: null,
      },
    });
    await expect(
      moved.service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toMatchObject({ response: { code: 'ENROLLMENT_OUT_OF_SECTION' } });
  });

  it('RF-41: reintenta ante P2002 y luego responde', async () => {
    const { service, tx } = setup();
    tx.grade.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const view = await service.put(
      A,
      E,
      { state: 'GRADED', value: '10.00', comment: null },
      teacher,
      actor,
    );
    expect(view.value).toBe('10.00');
    expect(tx.grade.create).toHaveBeenCalledTimes(2);
  });

  it('RF-41: 409 tras 3 choques seguidos', async () => {
    const { service, tx } = setup();
    tx.grade.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(
      service.put(A, E, { state: 'GRADED', value: '10.00', comment: null }, teacher, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
