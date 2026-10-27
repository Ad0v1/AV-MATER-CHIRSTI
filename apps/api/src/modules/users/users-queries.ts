import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { lockYearForShare } from './users-locks.js';
import { USERS_MSG } from './users.errors.js';

// Consultas compartidas por los servicios del módulo users.

type Db = Prisma.TransactionClient;

/** 409 si el correo ya lo usa otro usuario (el UNIQUE con P2002 cubre la carrera). */
export async function assertEmailFree(db: Db, email: string, exceptId?: string): Promise<void> {
  const other = await db.user.findUnique({
    where: { institutionalEmail: email },
    select: { id: true },
  });
  if (other && other.id !== exceptId) throw new ConflictException(USERS_MSG.emailTaken);
}

export type TargetSection = {
  id: string;
  academicYearId: string;
  gradeLevel: number;
  isActive: boolean;
};

/**
 * Sección destino de una matrícula (Decisión 4.4), dentro de la transacción: 404 si no existe;
 * bloquea su año FOR SHARE y exige que esté activo y sin cerrar (409 cerrado o sin año activo,
 * 422 si es de otro año); 409 si la sección está inactiva. `sectionId` y `academicYearId` salen
 * siempre juntos de la fila de Section.
 */
export async function resolveTargetSection(tx: Db, sectionId: string): Promise<TargetSection> {
  const section = await tx.section.findUnique({
    where: { id: sectionId },
    select: { id: true, academicYearId: true, gradeLevel: true, isActive: true },
  });
  if (!section) throw new NotFoundException(USERS_MSG.sectionNotFound);
  const year = await lockYearForShare(tx, section.academicYearId);
  if (!year) throw new NotFoundException(USERS_MSG.sectionNotFound);
  if (!year.isOpen) throw new ConflictException(USERS_MSG.yearClosed);
  if (!year.isActive) {
    const active = await tx.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!active) throw new ConflictException(USERS_MSG.noActiveYear);
    throw new UnprocessableEntityException(USERS_MSG.sectionOtherYear);
  }
  if (!section.isActive) throw new ConflictException(USERS_MSG.sectionInactive);
  return section;
}
