// Nombre, fecha y retencion de los respaldos. Son funciones puras para poder probarlas bien:
// un error aqui podria borrar respaldos que no debian borrarse.

const NAME = /^(?<prefix>.*?)(?<db>[A-Za-z0-9_]+)-(?<stamp>\d{8}T\d{6}Z)\.sql\.gz\.enc$/;

export type BackupEntry = { key: string; date: Date };

function pad(n: number, length = 2): string {
  return String(n).padStart(length, '0');
}

export function formatStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export function backupKey(prefix: string, database: string, date: Date): string {
  return `${prefix}${database}-${formatStamp(date)}.sql.gz.enc`;
}

// Devuelve null si el nombre no es de un respaldo nuestro: esos archivos nunca se tocan.
export function parseBackupKey(key: string, prefix: string, database: string): BackupEntry | null {
  const match = NAME.exec(key);
  const groups = match?.groups;
  if (!groups || groups.prefix !== prefix || groups.db !== database) return null;
  const s = groups.stamp!;
  const date = new Date(
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(9, 11)),
      Number(s.slice(11, 13)),
      Number(s.slice(13, 15)),
    ),
  );
  // Date normaliza fechas imposibles (mes 13, dia 99) en vez de rechazarlas; si al volver a
  // escribirla no queda igual al nombre, el nombre no era valido.
  return formatStamp(date) === s ? { key, date } : null;
}

// Respaldos que ya superaron la retencion. Siempre se conserva el mas reciente aunque sea viejo:
// si los respaldos dejaron de generarse, borrar el ultimo dejaria la institucion sin ninguno.
export function selectExpired(entries: BackupEntry[], now: Date, retentionDays: number): string[] {
  if (entries.length === 0) return [];
  const newest = entries.reduce((a, b) => (b.date > a.date ? b : a));
  const limit = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return entries.filter((e) => e.key !== newest.key && e.date.getTime() < limit).map((e) => e.key);
}

// Proxima ejecucion diaria a las HH:MM UTC (estrictamente en el futuro).
export function nextRun(now: Date, at: string): Date {
  const [hours, minutes] = at.split(':').map(Number) as [number, number];
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0, 0),
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
