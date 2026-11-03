import { Prisma } from '../../generated/prisma/client.js';

/**
 * Bloquea la fila del año (SELECT ... FOR UPDATE) hasta el fin de la transacción.
 * Cerrar año y reabrir período la toman primero, así se ejecutan en serie y nunca queda un año
 * cerrado con un período abierto. Las lecturas siguientes de la transacción ya ven el último
 * commit (la instantánea de InnoDB se fija en la primera lectura no bloqueante).
 * Devuelve false si el año no existe.
 */
export async function lockAcademicYear(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM AcademicYear WHERE id = ${id} FOR UPDATE`;
  return rows.length > 0;
}

export type LockedYearRow = { id: string; year: number; isActive: boolean; closedAt: Date | null };

type RawYearRow = { id: string; year: unknown; active: unknown; closedAt: Date | null };

const toLockedYear = (row: RawYearRow | undefined): LockedYearRow | null =>
  row
    ? {
        id: row.id,
        year: Number(row.year),
        isActive: Number(row.active) === 1,
        closedAt: row.closedAt,
      }
    : null;

/**
 * Bloqueo compartido de la fila del año (FOR SHARE), con sus datos actuales. Lo usa la
 * clonación (RF-15) sobre el año origen: cerrar ese año espera a que termine. null si no existe.
 */
export async function lockAcademicYearForShare(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedYearRow | null> {
  const rows = await tx.$queryRaw<RawYearRow[]>`
    SELECT id, year, (isActive IS NOT NULL AND isActive = 1) AS active, closedAt
    FROM AcademicYear WHERE id = ${id} FOR SHARE`;
  return toLockedYear(rows[0]);
}

/** Igual que lockAcademicYear (FOR UPDATE), pero devuelve los datos actuales de la fila. */
export async function lockAcademicYearRow(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedYearRow | null> {
  const rows = await tx.$queryRaw<RawYearRow[]>`
    SELECT id, year, (isActive IS NOT NULL AND isActive = 1) AS active, closedAt
    FROM AcademicYear WHERE id = ${id} FOR UPDATE`;
  return toLockedYear(rows[0]);
}

export type SharedUserRow = { id: string; role: string; status: string };

/**
 * Bloqueo compartido de varios usuarios (FOR SHARE) en una consulta, en orden de id, con su rol y
 * estado actuales. Lo usa la clonación con copyTeachers (RF-15) ANTES de los bloqueos de año,
 * para seguir el orden del proyecto (User → AcademicYear): un cambio de estado del docente
 * (FOR UPDATE) espera a la clonación y viceversa. Devuelve los que existen.
 */
export async function lockUsersForShare(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<SharedUserRow[]> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return [];
  return tx.$queryRaw<SharedUserRow[]>`
    SELECT id, role, status FROM User WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR SHARE`;
}
