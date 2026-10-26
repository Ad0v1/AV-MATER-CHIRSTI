import type { Prisma } from '../../generated/prisma/client.js';

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
