import type {
  AverageSummary,
  DeliveryCounts,
  EducationLevel,
  GradebookDashboard,
  GradeLiteralCode,
  GradingScale,
} from '@aula/shared';
import type { DisplayStatus } from '../submissions/display-status.js';
import type { LatestVersionSummary } from '../submissions/submissions.types.js';
import type { GradeSourceValue, GradeStateValue } from './grading.policy.js';

// Contratos HTTP de calificaciones (INFORME 1, sección 3). Fechas en ISO UTC; notas como texto
// con 2 decimales ("13.50"). exemptionReason solo en las vistas del docente y ADMIN (U2).
// Tres niveles (09/11/2026): SECUNDARIA usa value (0..20); INICIAL y PRIMARIA usan literal
// (AD/A/B/C), sin promedio (average.status = 'LITERAL_SCALE') y con logro del período.

/** Sección con su nivel. */
export type SectionRef = { id: string; level: EducationLevel; gradeLevel: number; code: string };

/** Logro del período (escala literal). comment solo para el docente, el estudiante y su apoderado. */
export type PeriodAchievementView = {
  literal: GradeLiteralCode;
  comment: string | null;
  gradedAt: string;
};

/** Respuesta de PUT /course-sections/:id/periods/:periodId/achievements/:enrollmentId. */
export type AchievementView = PeriodAchievementView & {
  id: string;
  enrollmentId: string;
  courseSectionId: string;
  periodId: string;
  updatedAt: string;
};

/** Respuesta de PUT /grades/:assignmentId/:enrollmentId. */
export type GradeView = {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  state: GradeStateValue;
  value: string | null;
  literal: GradeLiteralCode | null;
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
  /** Literal en escala literal; null en NE sin literal ("NE"). */
  literal: GradeLiteralCode | null;
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
    section: SectionRef;
    gradingScale: GradingScale;
  };
  period: PeriodRef;
  periods: PeriodRef[];
  assignments: {
    id: string;
    title: string;
    dueAt: string;
    allowLate: boolean;
    noSubmissionGrade: string;
    noSubmissionLiteral: GradeLiteralCode | null;
    average: AverageSummary;
    counts: DeliveryCounts;
  }[];
  students: {
    enrollmentId: string;
    studentId: string;
    fullName: string;
    isCurrent: boolean;
    average: AverageSummary;
    /** Logro del período (escala literal); null sin logro o en SECUNDARIA. */
    achievement: PeriodAchievementView | null;
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
    noSubmissionLiteral: GradeLiteralCode | null;
    gradingScale: GradingScale;
    /** Nivel de la sección: en INICIAL no hay entregas (la web adapta el formulario). */
    level: EducationLevel;
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
    section: SectionRef;
    gradingScale: GradingScale;
    periods: (PeriodRef & {
      average: AverageSummary;
      achievement: PeriodAchievementView | null;
      assignments: {
        assignmentId: string;
        title: string;
        dueAt: string;
        state: GradeStateValue | null;
        value: string | null;
        literal: GradeLiteralCode | null;
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
    currentSection: SectionRef | null;
  }[];
};
