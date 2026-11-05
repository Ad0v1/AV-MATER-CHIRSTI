import type { AverageSummary, DeliveryCounts, GradebookDashboard } from '@aula/shared';
import type { DisplayStatus } from '../submissions/display-status.js';
import type { LatestVersionSummary } from '../submissions/submissions.types.js';
import type { GradeSourceValue, GradeStateValue } from './grading.policy.js';

// Contratos HTTP de calificaciones (INFORME 1, sección 3). Fechas en ISO UTC; notas como texto
// con 2 decimales ("13.50"). exemptionReason solo en las vistas del docente y ADMIN (U2).

/** Respuesta de PUT /grades/:assignmentId/:enrollmentId. */
export type GradeView = {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  state: GradeStateValue;
  value: string | null;
  comment: string | null;
  exemptionReason: string | null;
  source: GradeSourceValue;
  gradedAt: string;
  updatedAt: string;
};

/** Evaluación efectiva de una celda (con NE virtual, A2). */
export type EffectiveGradeView = {
  state: GradeStateValue | null;
  value: string | null;
  /** NE calculada al leer, aún sin fila Grade. */
  virtual: boolean;
  /** NE con entrega posterior: hay que recalificar (RF-45). */
  needsRegrade: boolean;
};

export type GradebookCellView = EffectiveGradeView & {
  assignmentId: string;
  source: GradeSourceValue | null;
  neEligible: boolean;
  hasSubmission: boolean;
  isLate: boolean;
  displayStatus: DisplayStatus;
};

export type PeriodRef = { id: string; label: string; sequence: number; isOpen: boolean };

/** GET /course-sections/:id/gradebook?periodId= (registro auxiliar y dashboard, RF-47..49). */
export type GradebookView = {
  courseSection: {
    id: string;
    readOnly: boolean;
    course: { id: string; name: string };
    section: { id: string; gradeLevel: number; code: string };
  };
  period: PeriodRef;
  periods: PeriodRef[];
  assignments: {
    id: string;
    title: string;
    dueAt: string;
    allowLate: boolean;
    noSubmissionGrade: string;
    average: AverageSummary;
    counts: DeliveryCounts;
  }[];
  students: {
    enrollmentId: string;
    studentId: string;
    fullName: string;
    isCurrent: boolean;
    average: AverageSummary;
    atRisk: boolean;
    cells: GradebookCellView[];
  }[];
  dashboard: GradebookDashboard;
};

/** GET /assignments/:id/grade-summary (docente asignado o ADMIN). */
export type GradeSummaryView = {
  assignment: {
    id: string;
    title: string;
    courseSectionId: string;
    periodId: string;
    dueAt: string;
    allowLate: boolean;
    noSubmissionGrade: string;
    periodIsOpen: boolean;
  };
  items: {
    enrollmentId: string;
    studentId: string;
    fullName: string;
    isCurrent: boolean;
    neEligible: boolean;
    grade: EffectiveGradeView & {
      id: string | null;
      comment: string | null;
      exemptionReason: string | null;
      source: GradeSourceValue | null;
      gradedAt: string | null;
    };
    submission: {
      submissionId: string;
      versionCount: number;
      latestVersion: LatestVersionSummary;
    } | null;
    displayStatus: DisplayStatus;
    isLate: boolean;
    isOverdue: boolean;
  }[];
  average: AverageSummary;
  counts: DeliveryCounts;
};

/** GET /me/grades y GET /guardian/students/:studentId/grades (sin exemptionReason, U2). */
export type StudentGradesView = {
  student: { id: string; fullName: string };
  academicYear: { id: string; year: number } | null;
  courses: {
    courseSectionId: string;
    enrollmentId: string;
    isCurrent: boolean;
    course: { id: string; name: string };
    section: { id: string; gradeLevel: number; code: string };
    periods: (PeriodRef & {
      average: AverageSummary;
      assignments: {
        assignmentId: string;
        title: string;
        dueAt: string;
        state: GradeStateValue | null;
        value: string | null;
        comment: string | null;
        displayStatus: DisplayStatus;
        isLate: boolean;
      }[];
    })[];
  }[];
};

/** GET /guardian/students. */
export type GuardianStudentsView = {
  items: {
    studentId: string;
    fullName: string;
    currentSection: { id: string; gradeLevel: number; code: string } | null;
  }[];
};
