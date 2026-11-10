import { ConflictException } from '@nestjs/common';
import { lateBySeconds } from './display-status.js';
import type { SubmissionReceipt } from './submissions.types.js';

// Reglas puras de las entregas (RF-33, RF-36, RF-37, RF-39; RN-06, RN-09). Sin BD.

/** Entrega tardía: recibida después del plazo (justo en el plazo es a tiempo). */
export const isLateAt = (receivedAt: Date, dueAt: Date): boolean =>
  receivedAt.getTime() > dueAt.getTime();

export type Timing = { accepted: true; isLate: boolean } | { accepted: false };

/**
 * RF-37 / RN-06: a tiempo se acepta; tarde solo si la tarea admite tardías, marcada y sin
 * descuento. receivedAt es la hora del servidor al confirmar la subida (D-006).
 */
export function evaluateTiming(receivedAt: Date, dueAt: Date, allowLate: boolean): Timing {
  const isLate = isLateAt(receivedAt, dueAt);
  if (isLate && !allowLate) return { accepted: false };
  return { accepted: true, isLate };
}

/** Siguiente número de versión (RN-09: historial creciente desde 1). */
export const nextVersionNumber = (currentMax: number | null): number => (currentMax ?? 0) + 1;

export type VersionRow = {
  id: string;
  submissionId: string;
  versionNumber: number;
  receivedAt: Date;
  isLate: boolean;
  file: { id: string; originalName: string; sizeBytes: number | null; sha256: string | null };
};

/** Constancia de una versión (RF-39). */
export function toReceipt(
  version: VersionRow,
  assignment: { id: string; dueAt: Date },
  isOfficial: boolean,
): SubmissionReceipt {
  return {
    reference: version.id,
    submissionId: version.submissionId,
    assignmentId: assignment.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    receivedAt: version.receivedAt.toISOString(),
    isLate: version.isLate,
    lateBySeconds: version.isLate ? lateBySeconds(version.receivedAt, assignment.dueAt) : 0,
    isOfficial,
    status: version.isLate ? 'SUBMITTED_LATE' : 'SUBMITTED',
    file: {
      fileId: version.file.id,
      originalName: version.file.originalName,
      sizeBytes: version.file.sizeBytes ?? 0,
      sha256: version.file.sha256 ?? '',
    },
  };
}

/** Constancias de un historial, de la más nueva a la más antigua; la primera es la oficial. */
export function toReceipts(
  versions: VersionRow[],
  assignment: { id: string; dueAt: Date },
): SubmissionReceipt[] {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return sorted.map((v, i) => toReceipt(v, assignment, i === 0));
}

/** Decisión del usuario (09/11/2026): en INICIAL los niños no entregan PDF; las tareas son actividades. */
export const submissionsAllowedForLevel = (level: string | null | undefined): boolean =>
  level !== 'INICIAL';

export const NO_SUBMISSIONS_IN_LEVEL = {
  code: 'NO_SUBMISSIONS_IN_LEVEL',
  message: 'En Inicial las tareas son actividades sin entrega: no se suben archivos',
} as const;

/** 409 si la sección de la tarea no recibe entregas (INICIAL). */
export function assertSubmissionsAllowed(level: string | null | undefined): void {
  if (!submissionsAllowedForLevel(level)) throw new ConflictException(NO_SUBMISSIONS_IN_LEVEL);
}
