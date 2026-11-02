// Respuestas de la API de tareas y entregas (Dev 3, fases 3c y 3d). Fechas en ISO UTC.

export type AssignmentItem = {
  id: string;
  periodId: string;
  title: string;
  instructions: string;
  dueAt: string;
  maxSizeBytes: number;
  noSubmissionGrade: string;
  allowLate: boolean;
  periodIsOpen: boolean;
};

export type PeriodItem = { id: string; label: string; isOpen: boolean };

/** Constancia de una versión (RF-39). */
export type SubmissionReceipt = {
  reference: string;
  submissionId: string;
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  isLate: boolean;
  lateBySeconds: number;
  isOfficial: boolean;
  file: { fileId: string; originalName: string; sizeBytes: number; sha256: string };
};

export type SubmissionAccepted = {
  submissionId: string;
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  isLate: boolean;
  receipt: SubmissionReceipt;
};

/** GET /assignments/:id/submissions/me */
export type MySubmission = {
  submissionId: string | null;
  displayStatus: string;
  isLate: boolean;
  isOverdue: boolean;
  latestVersion: SubmissionReceipt | null;
  versions: SubmissionReceipt[];
};

/** Fila de GET /assignments/:id/submissions */
export type TeacherSubmissionItem = {
  enrollmentId: string;
  fullName: string;
  submissionId: string | null;
  latestVersion: { versionNumber: number; receivedAt: string; isLate: boolean } | null;
  versionCount: number;
  displayStatus: string;
};
