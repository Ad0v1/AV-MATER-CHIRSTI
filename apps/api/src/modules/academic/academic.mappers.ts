// Conversión entre la BD y las respuestas HTTP del módulo académico.

/** Fecha solo-día (@db.Date) a 'YYYY-MM-DD'. Prisma la devuelve a las 00:00 UTC. */
export const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

/** 'YYYY-MM-DD' a Date a las 00:00 UTC, para no depender de la zona de la máquina. */
export const fromDateOnly = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Timestamp a ISO UTC; null se mantiene. */
export const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** Columna marcador TRUE/NULL (isActive, isCurrent) a boolean. NULL y FALSE son false. */
export const marker = (value: boolean | null | undefined): boolean => value === true;

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return Object.is(a, b);
};

const auditValue = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export type FieldDiff = { before: Record<string, unknown>; after: Record<string, unknown> };

/**
 * Solo los campos que cambiaron (D-024), para before/after de la bitácora.
 * Compara las claves de `after` (las que valen undefined se ignoran); las fechas van en ISO.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const diff: FieldDiff = { before: {}, after: {} };
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (sameValue(before[key], after[key])) continue;
    diff.before[key] = auditValue(before[key] ?? null);
    diff.after[key] = auditValue(after[key]);
  }
  return diff;
}

export const hasChanges = (diff: FieldDiff): boolean => Object.keys(diff.after).length > 0;
