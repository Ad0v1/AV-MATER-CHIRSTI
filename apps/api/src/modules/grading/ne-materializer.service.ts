import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  isNeEligible,
  isOverdue,
  resolveNoSubmissionLiteral,
  scaleForLevel,
  type EducationLevel,
  type GradeLiteralCode,
} from '@aula/shared';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AcademicAccessService } from '../academic/academic-access.service.js';
import { isDeadlock } from '../academic/academic.errors.js';
import { AcademicEventPublisher } from '../academic/academic-events.js';
import { lockOpenPeriod } from '../contents/contents-guards.js';
import { recordGrading } from './grading-audit.js';
import { GradingEventPublisher } from './grading-events.js';
import { decimalText, type GradeAuditState } from './grading.policy.js';

// NE automática como fila Grade AUTO (U1, RF-44). Un único dueño de NE (docs/02): Dev 4.
// - Al leer el docente (registro y resumen de tarea), solo con período y año escribibles.
// - Al cerrar el período (period.closed.v1), para dejar fijas las NE del período.
// A3: mientras se materializa, una NE AUTO se resincroniza con la nota NE actual de la tarea.
// Transacción leer→insertar por tarea; si otro escribió a la vez (P2002 o bloqueo mutuo) se
// reintenta la transacción, que vuelve a leer. Nunca createMany({skipDuplicates}) (INFORME 1).
// Tres niveles (09/11/2026): en INICIAL/PRIMARIA la NE AUTO lleva el literal de la tarea
// (noSubmissionLiteral). Si la tarea no define literal, no se materializa (la BD exige value o
// literal en una NE) y la lectura muestra la NE virtual sin literal ("NE").

const MAX_ATTEMPTS = 3;
const logger = new Logger('NeMaterializer');

type AssignmentRow = {
  id: string;
  courseSectionId: string;
  periodId: string;
  dueAt: Date;
  noSubmissionGrade: { toFixed(d: number): string };
  noSubmissionLiteral: GradeLiteralCode | null;
  courseSection: { sectionId: string; section: { level: EducationLevel } };
};

/** Lo que debe valer una NE AUTO: un número (SECUNDARIA) o un literal (INICIAL/PRIMARIA). */
type Target = { value: string | null; literal: GradeLiteralCode | null };

type Change = {
  gradeId: string;
  assignmentId: string;
  enrollmentId: string;
  courseSectionId: string;
  before: GradeAuditState | null;
  after: GradeAuditState;
  updatedAt: Date;
};

const assignmentSelect = {
  id: true,
  courseSectionId: true,
  periodId: true,
  dueAt: true,
  noSubmissionGrade: true,
  noSubmissionLiteral: true,
  courseSection: { select: { sectionId: true, section: { select: { level: true } } } },
} as const;

/** Valor de la NE AUTO de una tarea, o null si no hay literal que guardar. */
function targetOf(a: AssignmentRow): Target | null {
  if (scaleForLevel(a.courseSection.section.level) === 'LITERAL_ADABC') {
    const literal = resolveNoSubmissionLiteral(a.noSubmissionLiteral);
    return literal === null ? null : { value: null, literal };
  }
  return { value: decimalText(a.noSubmissionGrade)!, literal: null };
}

const sameTarget = (
  g: { value: { toFixed(d: number): string } | null; literal: GradeLiteralCode | null },
  t: Target,
): boolean => decimalText(g.value) === t.value && g.literal === t.literal;

const retriable = (error: unknown): boolean => {
  if (isDeadlock(error)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
};

@Injectable()
export class NeMaterializer implements OnModuleInit, OnModuleDestroy {
  private unsubscribe: () => void = () => undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AcademicAccessService,
    private readonly academicEvents: AcademicEventPublisher,
    private readonly events: GradingEventPublisher,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.academicEvents.on('period.closed.v1', async (event) => {
      await this.materializePeriod(event.payload.periodId, new Date(event.payload.closedAt));
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe();
  }

  /** Al leer el docente: tareas vencidas del curso-sección en el período. No lanza. */
  async materializeCourseSection(
    courseSectionId: string,
    periodId: string,
    now: Date,
  ): Promise<number> {
    if (!(await this.writable(courseSectionId, periodId))) return 0;
    const assignments = await this.prisma.assignment.findMany({
      where: { courseSectionId, periodId, deletedAt: null, dueAt: { lt: now } },
      select: assignmentSelect,
    });
    let total = 0;
    for (const a of assignments) total += await this.materializeAssignmentRow(a, now, true);
    return total;
  }

  /** Al leer el resumen de una tarea. No lanza. */
  async materializeAssignment(assignmentId: string, now: Date): Promise<number> {
    const a = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      select: assignmentSelect,
    });
    if (!a || !isOverdue(a.dueAt, now)) return 0;
    if (!(await this.writable(a.courseSectionId, a.periodId))) return 0;
    return this.materializeAssignmentRow(a, now, true);
  }

  /**
   * @internal Solo lo llama el listener de period.closed.v1 (onModuleInit). No comprueba permisos
   * ni que el período esté cerrado: no exponerlo en un controlador ni llamarlo desde otro módulo
   * (INFORME 6, BAJO 5).
   * period.closed.v1: fija las NE de las tareas que ya vencieron al cerrar. El período ya está
   * cerrado: es la única escritura del sistema sobre él (no hay lockOpenPeriod).
   */
  async materializePeriod(periodId: string, closedAt: Date): Promise<number> {
    const assignments = await this.prisma.assignment.findMany({
      where: { periodId, deletedAt: null, dueAt: { lt: closedAt } },
      select: assignmentSelect,
    });
    let total = 0;
    for (const a of assignments) total += await this.materializeAssignmentRow(a, closedAt, false);
    return total;
  }

  private async writable(courseSectionId: string, periodId: string): Promise<boolean> {
    try {
      await this.access.assertCourseSectionWritable(courseSectionId, periodId);
      return true;
    } catch {
      return false; // RN-10: período o año cerrado → solo NE virtual al leer.
    }
  }

  /** Una tarea. Errores: se registran y se devuelve 0 (la lectura sigue con NE virtual). */
  private async materializeAssignmentRow(
    a: AssignmentRow,
    now: Date,
    requireOpen: boolean,
  ): Promise<number> {
    const target = targetOf(a);
    if (target === null) return 0;
    if (!(await this.hasWork(a, target))) return 0;

    let changes: Change[] = [];
    for (let attempt = 1; ; attempt++) {
      try {
        changes = await this.prisma.$transaction(async (tx) => {
          const list = await this.materializeInTx(tx, a, target, now, requireOpen);
          // D-047: la bitácora va en la misma transacción que las NE.
          for (const c of list) {
            await recordGrading(
              this.audit,
              {},
              'grade.auto_ne',
              c.gradeId,
              {
                before: c.before,
                after: c.after,
                changedFields: c.before === null ? createdFields(target) : [targetField(target)],
                assignmentId: c.assignmentId,
                enrollmentId: c.enrollmentId,
              },
              tx,
            );
          }
          return list;
        });
        break;
      } catch (error: unknown) {
        if (retriable(error) && attempt < MAX_ATTEMPTS) continue;
        const name = error instanceof Error ? error.name : typeof error;
        logger.warn(`No se materializó la NE de la tarea ${a.id}: ${name}`);
        return 0;
      }
    }

    for (const c of changes) {
      this.events.publish({
        type: 'grade.updated.v1',
        payload: {
          gradeId: c.gradeId,
          assignmentId: c.assignmentId,
          enrollmentId: c.enrollmentId,
          courseSectionId: c.courseSectionId,
          gradeStatus: 'NE',
          source: 'AUTO',
          updatedAt: c.updatedAt.toISOString(),
        },
      });
    }
    return changes.length;
  }

  /** Lectura previa sin transacción: evita abrir una si no hay nada que hacer. */
  private async hasWork(a: AssignmentRow, target: Target): Promise<boolean> {
    const plan = await this.plan(this.prisma, a, target);
    return plan.toCreate.length > 0 || plan.toResync.length > 0;
  }

  private async plan(
    db: Prisma.TransactionClient | PrismaService,
    a: AssignmentRow,
    target: Target,
  ) {
    const [enrollments, submissions, grades] = await Promise.all([
      db.enrollment.findMany({
        where: { sectionId: a.courseSection.sectionId },
        select: { id: true, effectiveFrom: true, effectiveTo: true },
      }),
      db.submission.findMany({
        where: { assignmentId: a.id, versions: { some: {} } },
        select: { enrollmentId: true },
      }),
      db.grade.findMany({
        where: { assignmentId: a.id },
        select: {
          id: true,
          enrollmentId: true,
          state: true,
          value: true,
          literal: true,
          source: true,
        },
      }),
    ]);
    const submitted = new Set(submissions.map((s) => s.enrollmentId));
    const graded = new Set(grades.map((g) => g.enrollmentId));
    const toCreate = enrollments
      .filter((e) => isNeEligible(e, a.dueAt) && !submitted.has(e.id) && !graded.has(e.id))
      .map((e) => e.id);
    const toResync = grades.filter(
      (g) => g.source === 'AUTO' && g.state === 'NE' && !sameTarget(g, target),
    );
    return { toCreate, toResync };
  }

  private async materializeInTx(
    tx: Prisma.TransactionClient,
    a: AssignmentRow,
    target: Target,
    now: Date,
    requireOpen: boolean,
  ): Promise<Change[]> {
    // RN-10: el cierre del período espera a esta transacción (FOR SHARE), igual que en contents.
    if (requireOpen) await lockOpenPeriod(tx, a.periodId);
    const { toCreate, toResync } = await this.plan(tx, a, target);
    const after: GradeAuditState = {
      state: 'NE',
      value: target.value,
      literal: target.literal,
      source: 'AUTO',
    };
    const changes: Change[] = [];
    for (const enrollmentId of toCreate) {
      const g = await tx.grade.create({
        data: {
          assignmentId: a.id,
          enrollmentId,
          state: 'NE',
          value: target.value,
          literal: target.literal,
          source: 'AUTO',
          gradedAt: now,
        },
        select: { id: true, updatedAt: true },
      });
      changes.push({
        gradeId: g.id,
        assignmentId: a.id,
        enrollmentId,
        courseSectionId: a.courseSectionId,
        before: null,
        after,
        updatedAt: g.updatedAt,
      });
    }
    for (const old of toResync) {
      // Solo si sigue siendo AUTO: un docente pudo editarla a la vez.
      const { count } = await tx.grade.updateMany({
        where: { id: old.id, source: 'AUTO', state: 'NE' },
        data: { value: target.value, literal: target.literal, gradedAt: now },
      });
      if (count === 0) continue;
      changes.push({
        gradeId: old.id,
        assignmentId: a.id,
        enrollmentId: old.enrollmentId,
        courseSectionId: a.courseSectionId,
        before: {
          state: 'NE',
          value: decimalText(old.value),
          literal: old.literal,
          source: 'AUTO',
        },
        after,
        updatedAt: now,
      });
    }
    return changes;
  }
}

const targetField = (t: Target): 'value' | 'literal' => (t.literal === null ? 'value' : 'literal');
const createdFields = (t: Target): string[] => ['state', targetField(t), 'source'];
