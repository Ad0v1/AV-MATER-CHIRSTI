// Estado visible de una entrega (RF-38, docs/04 "Los seis estados visibles"). Función pura, sin BD:
// la usan Dev 3 (vistas de entrega) y Dev 4 (registro de notas), que le pasa el estado de Grade.
// Se calcula al consultar; no se guarda (así no se pierde que una entrega fue tardía al calificarla).

/** Los seis rótulos de RF-38. */
export type DisplayStatus =
  | 'PENDING' // Pendiente
  | 'SUBMITTED' // Entregada
  | 'SUBMITTED_LATE' // Entregada con retraso
  | 'NOT_SUBMITTED' // No entregada (NE)
  | 'GRADED' // Calificada
  | 'EXEMPT'; // Exonerada

/** Estado de la nota que registra Dev 4 (mismo nombre que GradeState del motor de notas). */
export type GradeStateInput = 'GRADED' | 'NE' | 'EXEMPT';

export type DisplayStatusInput = {
  /** Versión oficial (la de mayor versionNumber) o null si no hay entrega. */
  latestVersion: { isLate: boolean } | null;
  /** Estado de Grade de Dev 4, o null si todavía no hay registro. */
  gradeState: GradeStateInput | null;
  dueAt: Date;
  allowLate: boolean;
  now: Date;
};

export type DisplayStatusResult = {
  status: DisplayStatus;
  /** Distintivo "con retraso": true si la versión oficial llegó después del plazo (RN-06). */
  isLate: boolean;
  /**
   * Sin entrega y ya no se puede entregar (venció y no admite tardías). El rótulo sigue siendo
   * PENDING hasta que Dev 4 registre la NE (docs/04): la UI puede mostrar "plazo vencido".
   */
  isOverdue: boolean;
};

/**
 * Precedencia (docs/04): EXEMPT > GRADED (con distintivo de retraso) > NE > entrega
 * (a tiempo o con retraso) > PENDING. Una NE registrada gana a una versión: la nota manda.
 */
export function computeDisplayStatus(input: DisplayStatusInput): DisplayStatusResult {
  const isLate = input.latestVersion?.isLate ?? false;
  const isOverdue =
    input.latestVersion === null && !input.allowLate && input.now.getTime() > input.dueAt.getTime();
  const result = (status: DisplayStatus): DisplayStatusResult => ({ status, isLate, isOverdue });

  switch (input.gradeState) {
    case 'EXEMPT':
      return result('EXEMPT');
    case 'GRADED':
      return result('GRADED');
    case 'NE':
      return result('NOT_SUBMITTED');
  }
  if (input.latestVersion !== null) return result(isLate ? 'SUBMITTED_LATE' : 'SUBMITTED');
  return result('PENDING');
}

/** Segundos de atraso de una entrega (0 si llegó a tiempo). RN-06: se informa, no descuenta. */
export const lateBySeconds = (receivedAt: Date, dueAt: Date): number =>
  Math.max(0, Math.floor((receivedAt.getTime() - dueAt.getTime()) / 1000));
