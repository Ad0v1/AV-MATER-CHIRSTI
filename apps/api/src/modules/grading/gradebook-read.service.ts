import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  buildGradebook,
  isNeEligible,
  type GradebookCell,
  type GradebookEntry,
} from '@aula/shared';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AcademicAccessService,
  periodIsOpen,
  type CourseSectionContext,
} from '../academic/academic-access.service.js';
import { MSG as ACADEMIC_MSG } from '../academic/academic.errors.js';
import { assertCanWriteCourseSection } from '../contents/contents-guards.js';
import { computeDisplayStatus } from '../submissions/display-status.js';
import { SubmissionsReadService } from '../submissions/submissions-read.service.js';
import { decimalText, toGradeEntry, type GradeRow } from './grading.policy.js';
import type {
  GradebookCellView,
  GradebookView,
  GradeSummaryView,
  GuardianStudentsView,
  PeriodRef,
  StudentGradesView,
} from './grading.types.js';
import { NeMaterializer } from './ne-materializer.service.js';

// Lecturas de calificaciones (RF-44, RF-47..49, RF-51, RF-52). Promedios al leer (A6) con el
// motor de packages/shared (un solo redondeo, literal, NE virtual A2, EXEMPT fuera, D-026).
// Filas: matrículas vigentes de la sección + cerradas con nota o entrega (RN-14).
// Exportado: Dev 5 (reportes) usa buildCourseSectionGradebook tras comprobar permisos.

type AssignmentLite = {
  id: string;
  title: string;
  courseSectionId: string;
  periodId: string;
  dueAt: Date;
  allowLate: boolean;
  noSubmissionGrade: { toFixed(d: number): string };
};

type EnrollmentLite = {
  id: string;
  studentId: string;
  isCurrent: boolean | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  student: { fullName: string };
};

type StoredCell = {
  grade: (GradeRow & { id: string; gradedAt: Date }) | null;
  submission: { isLate: boolean } | null;
};

const assignmentSelect = {
  id: true,
  title: true,
  courseSectionId: true,
  periodId: true,
  dueAt: true,
  allowLate: true,
  noSubmissionGrade: true,
} as const;

const key = (assignmentId: string, enrollmentId: string) => `${assignmentId}:${enrollmentId}`;

const periodRef = (p: {
  id: string;
  label: string;
  sequence: number;
  isOpen: boolean;
}): PeriodRef => ({ id: p.id, label: p.label, sequence: p.sequence, isOpen: p.isOpen });

@Injectable()
export class GradebookReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademicAccessService,
    private readonly submissions: SubmissionsReadService,
    private readonly materializer: NeMaterializer,
  ) {}

  /** GET /course-sections/:id/gradebook (docente asignado o ADMIN). */
  async gradebook(
    courseSectionId: string,
    periodId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<GradebookView> {
    await assertCanWriteCourseSection(this.access, user, courseSectionId);
    const now = new Date();
    const ctx = await this.access.getCourseSectionContext(courseSectionId, now);
    const period = await this.resolvePeriod(ctx, periodId);
    await this.materializer.materializeCourseSection(courseSectionId, period.id, now);
    return this.buildCourseSectionGradebook(ctx, period.id, now);
  }

  /**
   * Registro auxiliar de un curso-sección y período, sin comprobar permisos.
   * ADVERTENCIA (seguridad): el llamador valida antes que el actor es el docente asignado o
   * ADMIN; nunca se devuelve a STUDENT ni GUARDIAN (expone a otros estudiantes).
   */
  async buildCourseSectionGradebook(
    ctx: CourseSectionContext,
    periodId: string,
    now: Date,
  ): Promise<GradebookView> {
    const period = ctx.periods.find((p) => p.id === periodId);
    if (!period) throw new NotFoundException(ACADEMIC_MSG.periodNotFound);
    const assignments = await this.prisma.assignment.findMany({
      where: { courseSectionId: ctx.id, periodId, deletedAt: null },
      select: assignmentSelect,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
    const enrollments = await this.sectionEnrollments(ctx.section.id);
    const cells = await this.loadCells(
      assignments.map((a) => a.id),
      enrollments.map((e) => e.id),
    );
    const rows = this.visibleEnrollments(enrollments, assignments, cells);
    const book = this.build(assignments, rows, cells, now);

    return {
      courseSection: {
        id: ctx.id,
        readOnly: ctx.readOnly,
        course: ctx.course,
        section: {
          id: ctx.section.id,
          gradeLevel: ctx.section.gradeLevel,
          code: ctx.section.code,
        },
      },
      period: periodRef(period),
      periods: ctx.periods.map(periodRef),
      assignments: assignments.map((a, i) => ({
        id: a.id,
        title: a.title,
        dueAt: a.dueAt.toISOString(),
        allowLate: a.allowLate,
        noSubmissionGrade: decimalText(a.noSubmissionGrade)!,
        average: book.columns[i].average,
        counts: book.columns[i].counts,
      })),
      students: rows.map((e, i) => ({
        enrollmentId: e.id,
        studentId: e.studentId,
        fullName: e.student.fullName,
        isCurrent: e.isCurrent === true,
        average: book.rows[i].average,
        atRisk: book.rows[i].atRisk,
        cells: book.rows[i].entries.map((entry, j) =>
          this.cellView(entry, assignments[j], cells.get(key(assignments[j].id, e.id)), now),
        ),
      })),
      dashboard: book.dashboard,
    };
  }

  /** GET /assignments/:id/grade-summary (docente asignado o ADMIN). */
  async gradeSummary(assignmentId: string, user: AuthenticatedUser): Promise<GradeSummaryView> {
    const forGrading = await this.submissions.getAssignmentForGrading(assignmentId);
    await assertCanWriteCourseSection(this.access, user, forGrading.courseSectionId);
    const now = new Date();
    await this.materializer.materializeAssignment(assignmentId, now);

    const assignment = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { ...assignmentSelect, courseSection: { select: { sectionId: true } } },
    });
    const [periodOpen, enrollments, summaries] = await Promise.all([
      this.access.isPeriodOpen(assignment.periodId),
      this.sectionEnrollments(assignment.courseSection.sectionId),
      this.submissions.listSubmissionSummaries(assignmentId),
    ]);
    const cells = await this.loadCells(
      [assignmentId],
      enrollments.map((e) => e.id),
    );
    const rows = this.visibleEnrollments(enrollments, [assignment], cells);
    const book = this.build([assignment], rows, cells, now);
    const bySubmission = new Map(summaries.map((s) => [s.enrollmentId, s]));

    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        courseSectionId: assignment.courseSectionId,
        periodId: assignment.periodId,
        dueAt: assignment.dueAt.toISOString(),
        allowLate: assignment.allowLate,
        noSubmissionGrade: decimalText(assignment.noSubmissionGrade)!,
        periodIsOpen: periodOpen,
      },
      items: rows.map((e, i) => {
        const entry = book.rows[i].entries[0];
        const stored = cells.get(key(assignmentId, e.id))?.grade ?? null;
        const s = bySubmission.get(e.id);
        const display = computeDisplayStatus({
          latestVersion: s ? { isLate: s.latestVersion.isLate } : null,
          gradeState: entry.state,
          dueAt: assignment.dueAt,
          allowLate: assignment.allowLate,
          now,
        });
        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          fullName: e.student.fullName,
          isCurrent: e.isCurrent === true,
          neEligible: entry.neEligible,
          grade: {
            id: stored?.id ?? null,
            state: entry.state,
            value: entry.value,
            virtual: entry.virtual,
            needsRegrade: entry.needsRegrade,
            comment: stored?.comment ?? null,
            exemptionReason: stored?.exemptionReason ?? null,
            source: stored?.source ?? null,
            gradedAt: stored?.gradedAt.toISOString() ?? null,
          },
          submission: s
            ? {
                submissionId: s.submissionId,
                versionCount: s.versionCount,
                latestVersion: s.latestVersion,
              }
            : null,
          displayStatus: display.status,
          isLate: display.isLate,
          isOverdue: display.isOverdue,
        };
      }),
      average: book.columns[0].average,
      counts: book.columns[0].counts,
    };
  }

  /** GET /me/grades (RF-51): el estudiante ACTIVE ve solo lo suyo. */
  async myGrades(user: AuthenticatedUser, academicYearId?: string): Promise<StudentGradesView> {
    await this.assertActive(user.id);
    return this.studentGrades(user.id, academicYearId);
  }

  /** GET /guardian/students (RF-52): estudiantes con vínculo vigente. */
  async guardianStudents(user: AuthenticatedUser): Promise<GuardianStudentsView> {
    await this.assertActive(user.id);
    const ids = await this.access.getLinkedStudentIds(user.id);
    if (ids.length === 0) return { items: [] };
    const active = await this.access.getActiveYear();
    const students = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        enrollments: {
          where: { isCurrent: true, academicYearId: active?.id ?? '' },
          select: { section: { select: { id: true, gradeLevel: true, code: true } } },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return {
      items: students.map((s) => ({
        studentId: s.id,
        fullName: s.fullName,
        currentSection: s.enrollments[0]?.section ?? null,
      })),
    };
  }

  /** GET /guardian/students/:studentId/grades (RF-52): solo lectura y solo sus estudiantes. */
  async guardianStudentGrades(
    user: AuthenticatedUser,
    studentId: string,
    academicYearId?: string,
  ): Promise<StudentGradesView> {
    await this.assertActive(user.id);
    const ids = await this.access.getLinkedStudentIds(user.id);
    if (!ids.includes(studentId)) throw new ForbiddenException(ACADEMIC_MSG.forbidden);
    return this.studentGrades(studentId, academicYearId);
  }

  /**
   * Notas de un estudiante en un año, por matrícula, curso-sección y período. Sin
   * exemptionReason (U2). Una matrícula cerrada (traslado) muestra solo las tareas con nota,
   * entrega o NE que le correspondía (RN-14). Sin promedio anual (D-014).
   */
  private async studentGrades(
    studentId: string,
    academicYearId?: string,
  ): Promise<StudentGradesView> {
    const student = await this.prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      select: { id: true, fullName: true },
    });
    const year = academicYearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: academicYearId },
          select: { id: true, year: true, isActive: true, closedAt: true },
        })
      : await this.prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true, year: true, isActive: true, closedAt: true },
        });
    if (!year) {
      if (academicYearId) throw new NotFoundException(ACADEMIC_MSG.yearNotFound);
      return { student, academicYear: null, courses: [] };
    }

    const now = new Date();
    const [enrollments, periods] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId, academicYearId: year.id },
        select: {
          id: true,
          studentId: true,
          isCurrent: true,
          effectiveFrom: true,
          effectiveTo: true,
          student: { select: { fullName: true } },
          section: {
            select: {
              id: true,
              gradeLevel: true,
              code: true,
              courseSections: {
                select: { id: true, course: { select: { id: true, name: true } } },
                orderBy: { course: { name: 'asc' } },
              },
            },
          },
        },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.prisma.academicPeriod.findMany({
        where: { academicYearId: year.id },
        orderBy: { sequence: 'asc' },
      }),
    ]);
    const periodRefs = periods.map((p) => ({
      ...periodRef({ ...p, isOpen: periodIsOpen(p, year) }),
    }));

    const courses: StudentGradesView['courses'] = [];
    for (const e of enrollments) {
      const csIds = e.section.courseSections.map((cs) => cs.id);
      const assignments = await this.prisma.assignment.findMany({
        where: { courseSectionId: { in: csIds }, deletedAt: null },
        select: assignmentSelect,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      });
      const cells = await this.loadCells(
        assignments.map((a) => a.id),
        [e.id],
      );
      for (const cs of e.section.courseSections) {
        const coursePeriods: StudentGradesView['courses'][number]['periods'] = [];
        for (const p of periodRefs) {
          const shown = assignments.filter(
            (a) =>
              a.courseSectionId === cs.id &&
              a.periodId === p.id &&
              (e.isCurrent === true || isNeEligible(e, a.dueAt) || cells.has(key(a.id, e.id))),
          );
          if (shown.length === 0 && e.isCurrent !== true) continue;
          const book = this.build(shown, [e], cells, now);
          coursePeriods.push({
            ...p,
            average: book.rows[0].average,
            assignments: shown.map((a, j) => {
              const entry = book.rows[0].entries[j];
              const stored = cells.get(key(a.id, e.id))?.grade ?? null;
              return {
                assignmentId: a.id,
                title: a.title,
                dueAt: a.dueAt.toISOString(),
                state: entry.state,
                value: entry.value,
                comment: stored?.comment ?? null,
                displayStatus: this.display(entry, a, now),
                isLate: entry.isLate,
              };
            }),
          });
        }
        if (coursePeriods.length === 0) continue;
        courses.push({
          courseSectionId: cs.id,
          enrollmentId: e.id,
          isCurrent: e.isCurrent === true,
          course: cs.course,
          section: { id: e.section.id, gradeLevel: e.section.gradeLevel, code: e.section.code },
          periods: coursePeriods,
        });
      }
    }
    return { student, academicYear: { id: year.id, year: year.year }, courses };
  }

  // ---------------------------------------------------------------------------

  private async resolvePeriod(ctx: CourseSectionContext, periodId?: string) {
    const id = periodId ?? ctx.currentPeriodId ?? ctx.periods[0]?.id;
    const period = ctx.periods.find((p) => p.id === id);
    if (period) return period;
    if (periodId === undefined) throw new NotFoundException(ACADEMIC_MSG.periodNotFound);
    const exists = await this.prisma.academicPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(ACADEMIC_MSG.periodNotFound);
    throw new UnprocessableEntityException('El período no pertenece al año del curso');
  }

  /** Todas las matrículas de la sección (vigentes y cerradas), por nombre. */
  private sectionEnrollments(sectionId: string): Promise<EnrollmentLite[]> {
    return this.prisma.enrollment.findMany({
      where: { sectionId },
      select: {
        id: true,
        studentId: true,
        isCurrent: true,
        effectiveFrom: true,
        effectiveTo: true,
        student: { select: { fullName: true } },
      },
      orderBy: [{ student: { fullName: 'asc' } }, { effectiveFrom: 'asc' }],
    });
  }

  /** Vigentes + cerradas con nota o entrega en alguna de las tareas (RN-14). */
  private visibleEnrollments(
    enrollments: EnrollmentLite[],
    assignments: { id: string }[],
    cells: Map<string, StoredCell>,
  ): EnrollmentLite[] {
    return enrollments.filter(
      (e) => e.isCurrent === true || assignments.some((a) => cells.has(key(a.id, e.id))),
    );
  }

  /** Notas y entrega oficial (isLate de la última versión) por celda. Solo celdas con datos. */
  private async loadCells(
    assignmentIds: string[],
    enrollmentIds: string[],
  ): Promise<Map<string, StoredCell>> {
    const cells = new Map<string, StoredCell>();
    if (assignmentIds.length === 0 || enrollmentIds.length === 0) return cells;
    const where = { assignmentId: { in: assignmentIds }, enrollmentId: { in: enrollmentIds } };
    const [grades, submissions] = await Promise.all([
      this.prisma.grade.findMany({
        where,
        select: {
          id: true,
          assignmentId: true,
          enrollmentId: true,
          state: true,
          value: true,
          comment: true,
          exemptionReason: true,
          source: true,
          gradedAt: true,
        },
      }),
      this.prisma.submission.findMany({
        where: { ...where, versions: { some: {} } },
        select: {
          assignmentId: true,
          enrollmentId: true,
          versions: { select: { isLate: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      }),
    ]);
    const cell = (k: string): StoredCell => {
      let c = cells.get(k);
      if (!c) {
        c = { grade: null, submission: null };
        cells.set(k, c);
      }
      return c;
    };
    for (const g of grades) {
      cell(key(g.assignmentId, g.enrollmentId)).grade = { ...g, value: decimalText(g.value) };
    }
    for (const s of submissions) {
      cell(key(s.assignmentId, s.enrollmentId)).submission = { isLate: s.versions[0].isLate };
    }
    return cells;
  }

  private build(
    assignments: AssignmentLite[],
    enrollments: EnrollmentLite[],
    cells: Map<string, StoredCell>,
    now: Date,
  ) {
    const input: GradebookCell[] = [];
    for (const a of assignments) {
      for (const e of enrollments) {
        const c = cells.get(key(a.id, e.id));
        if (!c) continue;
        input.push({
          assignmentId: a.id,
          enrollmentId: e.id,
          grade: c.grade ? toGradeEntry(c.grade) : null,
          submission: c.submission,
        });
      }
    }
    return buildGradebook({
      assignments: assignments.map((a) => ({
        id: a.id,
        dueAt: a.dueAt,
        noSubmissionGrade: decimalText(a.noSubmissionGrade),
      })),
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        effectiveFrom: e.effectiveFrom,
        effectiveTo: e.effectiveTo,
      })),
      cells: input,
      now,
    });
  }

  private cellView(
    entry: GradebookEntry,
    assignment: AssignmentLite,
    stored: StoredCell | undefined,
    now: Date,
  ): GradebookCellView {
    return {
      assignmentId: entry.assignmentId,
      state: entry.state,
      value: entry.value,
      virtual: entry.virtual,
      needsRegrade: entry.needsRegrade,
      source: stored?.grade?.source ?? null,
      neEligible: entry.neEligible,
      hasSubmission: entry.hasSubmission,
      isLate: entry.isLate,
      displayStatus: this.display(entry, assignment, now),
    };
  }

  private display(entry: GradebookEntry, assignment: AssignmentLite, now: Date) {
    return computeDisplayStatus({
      latestVersion: entry.hasSubmission ? { isLate: entry.isLate } : null,
      gradeState: entry.state,
      dueAt: assignment.dueAt,
      allowLate: assignment.allowLate,
      now,
    }).status;
  }

  private async assertActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user?.status !== 'ACTIVE') throw new ForbiddenException(ACADEMIC_MSG.forbidden);
  }
}
