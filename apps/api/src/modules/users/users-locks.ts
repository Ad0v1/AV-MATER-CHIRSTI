import type { Prisma } from '../../generated/prisma/client.js';
import type { UserRole, UserStatus } from '../../generated/prisma/enums.js';

// Bloqueos de fila del módulo users (Decisión 4.6). Orden global dentro de una transacción:
// (0) lista de ADMIN activos FOR UPDATE (solo si el objetivo es ADMIN) → (1) User FOR UPDATE
// (varios usuarios: en orden de id) → (2) AcademicYear FOR SHARE → escrituras.
// La lista de ADMIN va primero: si cada transacción bloqueara antes su objetivo, dos cambios de
// estado de ADMIN distintos podrían esperarse en cruz (deadlock 1213). Aun así, un 1213 o P2034
// que llegue se traduce a 409 en mapPrismaError.
// Los datos se devuelven desde la lectura con bloqueo, que siempre ve el último commit aunque la
// transacción ya tenga fijada su instantánea (REPEATABLE READ).

export type LockedUser = { id: string; role: UserRole; status: UserStatus };
export type LockedYear = { id: string; isActive: boolean; isOpen: boolean };

const truthy = (value: unknown): boolean => Number(value) === 1;

/**
 * Rol del usuario SIN bloqueo, solo para decidir el orden de bloqueos antes de tomarlos (el rol
 * no cambia nunca, D-012). null si no existe. El estado se lee después con lockUserForUpdate.
 */
export async function readUserRole(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<UserRole | null> {
  const rows = await tx.$queryRaw<{ role: UserRole }[]>`
    SELECT role FROM User WHERE id = ${id}`;
  return rows[0]?.role ?? null;
}

/** Bloquea la fila del usuario hasta el fin de la transacción; null si no existe. */
export async function lockUserForUpdate(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedUser | null> {
  const rows = await tx.$queryRaw<LockedUser[]>`
    SELECT id, role, status FROM User WHERE id = ${id} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Bloquea varios usuarios en orden de id (evita esperas cruzadas); devuelve los que existen. */
export async function lockUsersForUpdate(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, LockedUser>> {
  const locked = new Map<string, LockedUser>();
  for (const id of [...new Set(ids)].sort()) {
    const user = await lockUserForUpdate(tx, id);
    if (user) locked.set(id, user);
  }
  return locked;
}

/**
 * Ids de los ADMIN activos, bloqueados FOR UPDATE y en orden de id: dos ADMIN que se desactivan
 * entre sí quedan en serie (o uno recibe P2034/1213 → 409), así nunca queda el sistema sin ADMIN
 * activo. Se toma ANTES que el bloqueo del usuario objetivo (paso 0 del orden global).
 */
export async function lockActiveAdminIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM User WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
  return rows.map((r) => r.id);
}

/**
 * Bloqueo compartido de la fila del año: cerrar el año (FOR UPDATE) espera a que terminen las
 * matrículas en curso y viceversa. null si el año no existe.
 */
export async function lockYearForShare(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<LockedYear | null> {
  const rows = await tx.$queryRaw<{ id: string; active: unknown; open: unknown }[]>`
    SELECT id, (isActive IS NOT NULL AND isActive = 1) AS active, (closedAt IS NULL) AS open
    FROM AcademicYear WHERE id = ${id} FOR SHARE`;
  const row = rows[0];
  return row ? { id: row.id, isActive: truthy(row.active), isOpen: truthy(row.open) } : null;
}
