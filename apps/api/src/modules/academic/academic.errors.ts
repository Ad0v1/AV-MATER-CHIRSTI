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

/**
 * Traduce errores de Prisma por concurrencia: P2002 (único), P2003 (FK) y P2034 (bloqueo mutuo
 * o conflicto de escritura) → 409, P2025 (no existe) → 404. Cualquier otro error se relanza tal cual.
 */
export function mapPrismaError(error: unknown, duplicateMessage: string = MSG.duplicate): never {
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
