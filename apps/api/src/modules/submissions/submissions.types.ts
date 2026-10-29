import type { DisplayStatus } from './display-status.js';

// Contratos HTTP de las entregas (INFORME 1, decisión 3 y fase 3d). Fechas en ISO UTC.

/** Constancia de una versión (RF-39): fecha y hora, archivo, estado y referencia. */
export type SubmissionReceipt = {
  /** Referencia de la constancia: el id de la versión. */
  reference: string;
  submissionId: string;
  assignmentId: string;
  versionId: string;
  versionNumber: number;
  /** D-006: hora del servidor al confirmar la subida (StoredFile.completedAt). */
  receivedAt: string;
  isLate: boolean;
  /** RN-06: atraso informado en segundos; sin descuento. */
  lateBySeconds: number;
  /** RN-09: la oficial es la de mayor versionNumber. */
  isOfficial: boolean;
  status: Extract<DisplayStatus, 'SUBMITTED' | 'SUBMITTED_LATE'>;
  file: { fileId: string; originalName: string; sizeBytes: number; sha256: string };
};

/** Respuesta de POST /assignments/:id/submissions (201 nueva; 200 si el fileId ya se entregó). */
export type SubmissionAccepted = {
  submissionId: string;
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  isLate: boolean;
  receipt: SubmissionReceipt;
};

/** GET /assignments/:id/submissions/me */
export type MySubmissionView = {
  assignment: { id: string; dueAt: string; allowLate: boolean; maxSizeBytes: number };
  submissionId: string | null;
  displayStatus: DisplayStatus;
  isLate: boolean;
  isOverdue: boolean;
  /** Versión oficial o null. */
  latestVersion: SubmissionReceipt | null;
  /** Historial completo, de la más nueva a la más antigua. */
  versions: SubmissionReceipt[];
};

/** GET /submissions/:id/versions */
export type SubmissionVersionsView = {
  submissionId: string;
  assignmentId: string;
  enrollmentId: string;
  versions: SubmissionReceipt[];
};

/** Resumen de la versión oficial para la lista del docente y para Dev 4. */
export type LatestVersionSummary = {
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  isLate: boolean;
  fileId: string;
};

/** Fila de GET /assignments/:id/submissions (docente asignado o ADMIN). */
export type TeacherSubmissionItem = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  submissionId: string | null;
  latestVersion: LatestVersionSummary | null;
  versionCount: number;
  /** Parcial (RF-38): sin la nota de Dev 4, solo PENDING, SUBMITTED o SUBMITTED_LATE. */
  displayStatus: DisplayStatus;
};
