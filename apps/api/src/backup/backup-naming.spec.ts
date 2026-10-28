import {
  backupKey,
  formatStamp,
  nextRun,
  parseBackupKey,
  selectExpired,
  type BackupEntry,
} from './backup-naming.js';

const day = (iso: string) => new Date(`${iso}T07:00:00Z`);

describe('nombres de respaldo', () => {
  it('genera y vuelve a leer el nombre con su fecha', () => {
    const date = new Date('2026-10-21T07:05:09Z');
    const key = backupKey('db/', 'aula_virtual', date);

    expect(key).toBe('db/aula_virtual-20261021T070509Z.sql.gz.enc');
    expect(parseBackupKey(key, 'db/', 'aula_virtual')).toEqual({ key, date });
  });

  it('usa siempre UTC', () => {
    expect(formatStamp(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z');
  });

  it('ignora archivos que no son respaldos de esta base', () => {
    expect(parseBackupKey('db/notas.txt', 'db/', 'aula_virtual')).toBeNull();
    expect(parseBackupKey('db/otra-20261021T070509Z.sql.gz.enc', 'db/', 'aula_virtual')).toBeNull();
    expect(
      parseBackupKey('x/aula_virtual-20261021T070509Z.sql.gz.enc', 'db/', 'aula_virtual'),
    ).toBeNull();
  });

  it('rechaza una fecha imposible en el nombre', () => {
    expect(
      parseBackupKey('db/aula_virtual-20261399T250000Z.sql.gz.enc', 'db/', 'aula_virtual'),
    ).toBeNull();
  });
});

describe('retencion', () => {
  const entry = (iso: string): BackupEntry => ({ key: `db/${iso}`, date: day(iso) });

  it('borra solo lo que supera los 30 dias', () => {
    const entries = ['2026-08-01', '2026-09-15', '2026-09-22', '2026-10-20'].map(entry);
    const expired = selectExpired(entries, day('2026-10-21'), 30);

    expect(expired).toEqual(['db/2026-08-01', 'db/2026-09-15']);
  });

  it('conserva el que tiene exactamente 30 dias', () => {
    const entries = [entry('2026-09-21'), entry('2026-10-20')];
    expect(selectExpired(entries, day('2026-10-21'), 30)).toEqual([]);
  });

  it('nunca borra el respaldo mas reciente, aunque este vencido', () => {
    const entries = [entry('2026-05-01'), entry('2026-06-01')];
    expect(selectExpired(entries, day('2026-10-21'), 30)).toEqual(['db/2026-05-01']);
  });

  it('no hace nada sin respaldos', () => {
    expect(selectExpired([], day('2026-10-21'), 30)).toEqual([]);
  });
});

describe('proxima ejecucion diaria', () => {
  it('es hoy si la hora aun no llego', () => {
    expect(nextRun(new Date('2026-10-21T05:00:00Z'), '07:00').toISOString()).toBe(
      '2026-10-21T07:00:00.000Z',
    );
  });

  it('es manana si la hora ya paso', () => {
    expect(nextRun(new Date('2026-10-21T08:00:00Z'), '07:00').toISOString()).toBe(
      '2026-10-22T07:00:00.000Z',
    );
  });

  it('es manana si es exactamente la hora (nunca repite)', () => {
    expect(nextRun(new Date('2026-10-21T07:00:00Z'), '07:00').toISOString()).toBe(
      '2026-10-22T07:00:00.000Z',
    );
  });

  it('cruza el fin de mes', () => {
    expect(nextRun(new Date('2026-10-31T23:00:00Z'), '07:00').toISOString()).toBe(
      '2026-11-01T07:00:00.000Z',
    );
  });
});
