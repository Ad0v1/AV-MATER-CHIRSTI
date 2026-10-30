import { computeDisplayStatus, lateBySeconds } from './display-status.js';
import { submitSchema } from './submissions.dto.js';
import {
  evaluateTiming,
  isLateAt,
  nextVersionNumber,
  toReceipts,
  type VersionRow,
} from './submissions.policy.js';

const due = new Date('2026-10-20T23:59:00-05:00');
const before = new Date(due.getTime() - 60_000);
const after = new Date(due.getTime() + 90_000);

describe('computeDisplayStatus (RF-38, docs/04)', () => {
  const base = { dueAt: due, allowLate: false, now: before, gradeState: null } as const;

  it('sin versión ni nota: PENDING; vencido y sin tardías marca isOverdue', () => {
    expect(computeDisplayStatus({ ...base, latestVersion: null })).toEqual({
      status: 'PENDING',
      isLate: false,
      isOverdue: false,
    });
    expect(computeDisplayStatus({ ...base, latestVersion: null, now: after }).isOverdue).toBe(true);
    expect(
      computeDisplayStatus({ ...base, latestVersion: null, now: after, allowLate: true }).isOverdue,
    ).toBe(false);
  });

  it('con versión: SUBMITTED o SUBMITTED_LATE', () => {
    expect(computeDisplayStatus({ ...base, latestVersion: { isLate: false } }).status).toBe(
      'SUBMITTED',
    );
    expect(computeDisplayStatus({ ...base, latestVersion: { isLate: true } })).toMatchObject({
      status: 'SUBMITTED_LATE',
      isLate: true,
    });
  });

  it('precedencia de la nota de Dev 4: EXEMPT > GRADED (con retraso) > NE', () => {
    const late = { latestVersion: { isLate: true } };
    expect(computeDisplayStatus({ ...base, ...late, gradeState: 'EXEMPT' }).status).toBe('EXEMPT');
    expect(computeDisplayStatus({ ...base, ...late, gradeState: 'GRADED' })).toMatchObject({
      status: 'GRADED',
      isLate: true,
    });
    expect(computeDisplayStatus({ ...base, latestVersion: null, gradeState: 'NE' }).status).toBe(
      'NOT_SUBMITTED',
    );
  });
});

describe('puntualidad (RF-37, RN-06)', () => {
  it('justo en el plazo es a tiempo; después es tarde', () => {
    expect(isLateAt(due, due)).toBe(false);
    expect(isLateAt(after, due)).toBe(true);
  });

  it('QA-008/009: tarde se acepta solo con allowLate, marcada y sin descuento', () => {
    expect(evaluateTiming(before, due, false)).toEqual({ accepted: true, isLate: false });
    expect(evaluateTiming(after, due, true)).toEqual({ accepted: true, isLate: true });
    expect(evaluateTiming(after, due, false)).toEqual({ accepted: false });
  });

  it('lateBySeconds informa el atraso', () => {
    expect(lateBySeconds(after, due)).toBe(90);
    expect(lateBySeconds(before, due)).toBe(0);
  });
});

describe('versiones (RN-09)', () => {
  it('nextVersionNumber empieza en 1', () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber(3)).toBe(4);
  });

  it('QA-007/010: constancias de la más nueva a la más antigua; solo la primera es oficial', () => {
    const v = (n: number, isLate: boolean, receivedAt: Date): VersionRow => ({
      id: `v${n}`,
      submissionId: 's',
      versionNumber: n,
      receivedAt,
      isLate,
      file: { id: `f${n}`, originalName: `t${n}.pdf`, sizeBytes: 10, sha256: 'a'.repeat(64) },
    });
    const receipts = toReceipts([v(1, false, before), v(2, true, after)], {
      id: 'a',
      dueAt: due,
    });
    expect(receipts.map((r) => [r.versionNumber, r.isOfficial, r.status])).toEqual([
      [2, true, 'SUBMITTED_LATE'],
      [1, false, 'SUBMITTED'],
    ]);
    expect(receipts[0]).toMatchObject({
      reference: 'v2',
      assignmentId: 'a',
      lateBySeconds: 90,
      receivedAt: after.toISOString(),
      file: { fileId: 'f2', originalName: 't2.pdf', sizeBytes: 10 },
    });
  });
});

describe('submitSchema', () => {
  const id = '0198a3c4-0000-7000-8000-000000000001';
  it('solo acepta { fileId } UUID', () => {
    expect(submitSchema.safeParse({ fileId: id }).success).toBe(true);
    expect(submitSchema.safeParse({ fileId: 'x' }).success).toBe(false);
    expect(submitSchema.safeParse({ fileId: id, late: true }).success).toBe(false);
  });
});
