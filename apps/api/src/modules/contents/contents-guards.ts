import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AcademicAccessService } from '../academic/academic-access.service.js';

// Comprobaciones comunes a tareas y materiales.

export const PERIOD_CLOSED = 'El período está cerrado';

/**
 * Bloqueo compartido del período (FOR SHARE) hasta el fin de la transacción: cerrar el período
 * (UPDATE de la fila) espera, así no se escribe en un período recién cerrado (RN-10).
 * Orden de bloqueos del módulo: AcademicPeriod → Assignment/Material → StoredFile.
 */
export async function lockOpenPeriod(
  tx: Prisma.TransactionClient,
  periodId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ closedAt: Date | null }[]>`
    SELECT closedAt FROM AcademicPeriod WHERE id = ${periodId} FOR SHARE`;
  if (rows.length === 0 || rows[0].closedAt !== null) {
    throw new ConflictException(PERIOD_CLOSED);
  }
}

/**
 * Escriben el docente asignado o ADMIN (modo soporte, queda en la bitácora). 404 si el
 * curso-sección no existe; 403 si no es su docente o el usuario no está ACTIVE.
 */
export async function assertCanWriteCourseSection(
  access: AcademicAccessService,
  user: AuthenticatedUser,
  courseSectionId: string,
): Promise<void> {
  if (user.role === 'ADMIN') {
    await access.assertCanAccessCourseSection(user, courseSectionId);
    return;
  }
  await access.assertTeacherOf(user.id, courseSectionId);
}
