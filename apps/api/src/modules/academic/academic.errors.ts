import { ConflictException, NotFoundException } from '@nestjs/common';

// Mensajes fijos en español; el filtro global pone el código según el status (docs/03).
export const MSG = {
  yearNotFound: 'El año académico no existe',
  periodNotFound: 'El período no existe',
  sectionNotFound: 'La sección no existe',
  courseNotFound: 'El curso no existe',
  courseSectionNotFound: 'El curso de la sección no existe',
  readOnlyYear: 'El año académico es de solo lectura',
  yearClosed: 'El año académico está cerrado',
  yearAlreadyClosed: 'El año académico ya está cerrado',
  reopenOnlyActiveYear: 'Solo se reabren períodos del año activo',
  duplicate: 'Ya existe un registro con esos datos',
  conflict: 'El registro cambió o está en uso; vuelve a intentarlo',
  forbidden: 'No tienes permiso para esta accion',
  invalidTeacher: 'El usuario no es un docente activo',
} as const;

const prismaCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

/** Código de error de MySQL para el bloqueo mutuo (deadlock). */
export const MYSQL_DEADLOCK = 1213;

/**
 * true si el error es un bloqueo mutuo de MySQL (1213) que Prisma no tradujo a P2034: en
 * `$queryRaw` llega como P2010 con `meta.driverAdapterError.cause` (originalCode '1213' o
 * kind TransactionWriteConflict), y un error del driver sin envolver trae `errno` 1213.
 */
export function isDeadlock(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as {
    code?: unknown;
    errno?: unknown;
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } };
  };
  if (e.errno === MYSQL_DEADLOCK) return true;
  if (e.code !== 'P2010') return false;
  const cause = e.meta?.driverAdapterError?.cause;
  return (
    cause?.originalCode === String(MYSQL_DEADLOCK) || cause?.kind === 'TransactionWriteConflict'
  );
}

/**
 * Traduce errores de Prisma por concurrencia: P2002 (único), P2003 (FK), P2034 (bloqueo mutuo
 * o conflicto de escritura) y el deadlock 1213 de MySQL aunque llegue como P2010 desde un
 * `$queryRaw` → 409, P2025 (no existe) → 404. Cualquier otro error se relanza tal cual.
 */
export function mapPrismaError(error: unknown, duplicateMessage: string = MSG.duplicate): never {
  if (isDeadlock(error)) throw new ConflictException(MSG.conflict);
  switch (prismaCode(error)) {
    case 'P2002':
      throw new ConflictException(duplicateMessage);
    case 'P2003':
    case 'P2034':
      throw new ConflictException(MSG.conflict);
    case 'P2025':
      throw new NotFoundException('El registro no existe');
    default:
      throw error;
  }
}
