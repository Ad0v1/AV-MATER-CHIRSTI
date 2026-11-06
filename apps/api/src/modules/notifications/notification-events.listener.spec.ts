import { describe, expect, it, vi } from 'vitest';
import { AnnouncementEventPublisher } from '../announcements/announcements-events.js';
import { ContentsEventPublisher } from '../contents/contents-events.js';
import { GradingEventPublisher } from '../grading/grading-events.js';
import type { QueueService } from '../queue/index.js';
import { NotificationEventsListener } from './notification-events.listener.js';

const A = '0190a6f0-0000-7000-8000-000000000001';
const G = '0190a6f0-0000-7000-8000-000000000002';
const N = '0190a6f0-0000-7000-8000-000000000003';
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(fail = false) {
  const enqueue = vi.fn(() =>
    fail ? Promise.reject(new Error('redis://secreto')) : Promise.resolve('id'),
  );
  const contents = new ContentsEventPublisher();
  const grading = new GradingEventPublisher();
  const announcements = new AnnouncementEventPublisher();
  const listener = new NotificationEventsListener(
    { enqueue } as unknown as QueueService,
    contents,
    grading,
    announcements,
  );
  listener.onModuleInit();
  return { listener, enqueue, contents, grading, announcements };
}

const assignmentBase = {
  assignmentId: A,
  courseSectionId: 'cs',
  periodId: 'p',
  dueAt: '2026-05-01T05:00:00.000Z',
  allowLate: false,
};
const grade = (source: 'MANUAL' | 'AUTO') => ({
  type: 'grade.updated.v1' as const,
  payload: {
    gradeId: G,
    assignmentId: A,
    enrollmentId: 'e',
    courseSectionId: 'cs',
    gradeStatus: 'GRADED' as const,
    source,
    updatedAt: '2026-05-01T05:00:00.000Z',
  },
});

describe('NotificationEventsListener (RF-53, U2)', () => {
  it('assignment.created.v1 → assignment-created con jobId fijo y solo el id', async () => {
    const { enqueue, contents } = setup();
    contents.publish({
      type: 'assignment.created.v1',
      payload: { ...assignmentBase, createdAt: '2026-04-01T00:00:00.000Z' },
    });
    await tick();
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'assignment-created',
      { assignmentId: A },
      { jobId: `assignment-created-${A}` },
    );
  });

  it('assignment.updated.v1 solo encola si cambió dueAt (jobId con el nuevo plazo)', async () => {
    const { enqueue, contents } = setup();
    const updated = (changedFields: string[]) =>
      contents.publish({
        type: 'assignment.updated.v1',
        payload: { ...assignmentBase, changedFields, updatedAt: '2026-04-02T00:00:00.000Z' },
      });
    updated(['title']);
    await tick();
    expect(enqueue).not.toHaveBeenCalled();
    updated(['dueAt', 'title']);
    await tick();
    const ms = Date.parse(assignmentBase.dueAt);
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'assignment-due-check',
      { assignmentId: A, dueAtMs: ms },
      { jobId: `assignment-due-${A}-${ms}` },
    );
  });

  it('grade.updated.v1: MANUAL avisa, AUTO (NE del barrido) no', async () => {
    const { enqueue, grading } = setup();
    grading.publish(grade('AUTO'));
    await tick();
    expect(enqueue).not.toHaveBeenCalled();
    grading.publish(grade('MANUAL'));
    await tick();
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'grade-published',
      { gradeId: G },
      { jobId: `grade-published-${G}` },
    );
  });

  it('announcement.published.v1 → announcement-published', async () => {
    const { enqueue, announcements } = setup();
    announcements.publish({
      type: 'announcement.published.v1',
      payload: {
        announcementId: N,
        academicYearId: 'y',
        scope: 'INSTITUTION',
        gradeLevel: null,
        courseSectionId: null,
        publishedAt: '2026-05-01T05:00:00.000Z',
      },
    });
    await tick();
    expect(enqueue).toHaveBeenCalledWith(
      'notifications',
      'announcement-published',
      { announcementId: N },
      { jobId: `announcement-published-${N}` },
    );
  });

  it('si Redis falla no lanza ni registra el mensaje del error', async () => {
    const { enqueue, grading } = setup(true);
    const warn = vi.spyOn((await import('@nestjs/common')).Logger.prototype, 'warn');
    grading.publish(grade('MANUAL'));
    await tick();
    expect(enqueue).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secreto');
    warn.mockRestore();
  });

  it('onModuleDestroy desuscribe', async () => {
    const { listener, enqueue, grading } = setup();
    listener.onModuleDestroy();
    grading.publish(grade('MANUAL'));
    await tick();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
