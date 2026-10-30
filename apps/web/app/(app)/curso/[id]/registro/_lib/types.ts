// Contratos HTTP de calificaciones (Dev 4), adaptados de apps/api/src/modules/grading/grading.types.ts.
// La web no importa código de la API: si cambia el contrato, se actualiza aquí.
import type { DisplayStatus } from '../../tareas/assignment-format';

export type { DisplayStatus };
export type GradeState = 'GRADED' | 'NE' | 'EXEMPT';
export type GradeSource = 'MANUAL' | 'AUTO';

/** Promedio con literal; sin notas que cuenten es NO_GRADES (D-026), nunca 0. */
export type AverageSummary =
  | { status: 'OK'; rounded: number; literal: string; counted: number; exempt: number }
  | { status: 'NO_GRADES'; counted: 0; exempt: number };

export type DeliveryCounts = { onTime: number; late: number; ne: number };

export type GradebookDashboard = {
  distribution: Record<string, number>;
  noGrades: number;
  counts: DeliveryCounts;
  riskLiteral: string;
  atRisk: string[];
};

export type PeriodRef = { id: string; label: string; sequence: number; isOpen: boolean };

export type EffectiveGrade = {
  state: GradeState | null;
  value: string | null;
  virtual: boolean;
  needsRegrade: boolean;
};

export type GradebookCell = EffectiveGrade & {
  assignmentId: string;
  source: GradeSource | null;
  neEligible: boolean;
  hasSubmission: boolean;
  isLate: boolean;
  displayStatus: DisplayStatus;
};

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
    cells: GradebookCell[];
  }[];
  dashboard: GradebookDashboard;
};

export type LatestVersionSummary = {
  versionId: string;
  versionNumber: number;
  receivedAt: string;
  isLate: boolean;
  fileId: string;
};

export type GradeSummaryItem = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  isCurrent: boolean;
  neEligible: boolean;
  grade: EffectiveGrade & {
    id: string | null;
    comment: string | null;
    exemptionReason: string | null;
    source: GradeSource | null;
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
};

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
  items: GradeSummaryItem[];
  average: AverageSummary;
  counts: DeliveryCounts;
};

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
        state: GradeState | null;
        value: string | null;
        comment: string | null;
        displayStatus: DisplayStatus;
        isLate: boolean;
      }[];
    })[];
  }[];
};

export type GuardianStudentsView = {
  items: {
    studentId: string;
    fullName: string;
    currentSection: { id: string; gradeLevel: number; code: string } | null;
  }[];
};

/** Cuerpo de PUT /grades/:assignmentId/:enrollmentId. */
export type GradeInput =
  | { state: 'GRADED'; value: string; comment?: string }
  | { state: 'NE'; value?: string; comment?: string }
  | { state: 'EXEMPT'; exemptionReason: string; comment?: string };
