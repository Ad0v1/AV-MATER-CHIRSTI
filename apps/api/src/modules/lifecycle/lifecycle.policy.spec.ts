import { isBackedUp, purgeStatus, sectionsNeedingBackup } from './lifecycle.policy.js';

const DAY = 86_400_000;
const closedAt = new Date('2026-12-20T00:00:00Z');
const t = (ms: number) => new Date(closedAt.getTime() + ms);
const backup = (
  sectionId: string,
  status: 'QUEUED' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED',
  at = 0,
) => ({
  sectionId,
  status,
  createdAt: t(at),
});
const base = {
  closedAt,
  purgeAfterDays: 60,
  sectionIds: ['a', 'b'],
  backups: [backup('a', 'SUCCEEDED'), backup('b', 'SUCCEEDED')],
  purgedAt: null,
  now: t(61 * DAY),
};

describe('lifecycle.policy (U7)', () => {
  it('año abierto: NOT_CLOSED sin fecha', () => {
    expect(purgeStatus({ ...base, closedAt: null })).toMatchObject({
      state: 'NOT_CLOSED',
      eligibleAt: null,
    });
  });

  it('falta un respaldo o el último falló: WAITING_BACKUPS', () => {
    expect(purgeStatus({ ...base, backups: [backup('a', 'SUCCEEDED')] }).state).toBe(
      'WAITING_BACKUPS',
    );
    const failedLater = [...base.backups, backup('b', 'FAILED', 1000)];
    expect(purgeStatus({ ...base, backups: failedLater })).toMatchObject({
      state: 'WAITING_BACKUPS',
      sectionsBackedUp: 1,
    });
  });

  it('respaldos listos antes del plazo: WAITING_DEADLINE; cumplido: ELIGIBLE', () => {
    expect(purgeStatus({ ...base, now: t(59 * DAY) })).toMatchObject({
      state: 'WAITING_DEADLINE',
      eligibleAt: t(60 * DAY),
    });
    expect(purgeStatus({ ...base, now: t(60 * DAY) }).state).toBe('ELIGIBLE');
  });

  it('EXPIRED cuenta como respaldado (purga cortada y reintentada) y PURGED gana', () => {
    expect(isBackedUp('EXPIRED')).toBe(true);
    expect(isBackedUp('RUNNING')).toBe(false);
    expect(purgeStatus({ ...base, purgedAt: t(70 * DAY) }).state).toBe('PURGED');
  });

  it('solo se reencolan las secciones sin respaldo o con el último FAILED', () => {
    expect(
      sectionsNeedingBackup(
        ['a', 'b', 'c', 'd'],
        [
          backup('a', 'QUEUED'),
          backup('b', 'FAILED'),
          backup('c', 'FAILED'),
          backup('c', 'SUCCEEDED', 5),
        ],
      ),
    ).toEqual(['b', 'd']);
  });
});
