import { calculateAverage, type GradeEntry } from './average';
import {
  assertDate,
  isNeEligible,
  resolveEffectiveEntry,
  type EffectiveEntry,
  type EnrollmentWindow,
} from './effective-entry';
import { GradingError } from './errors';
import { GRADE_MIN, type GradeInput } from './grade-value';
import {
  assertLiteralScale,
  DEFAULT_LITERAL_SCALE,
  toLiteral,
  type LiteralScale,
} from './literal-scale';

/** Tarea (columna) del registro auxiliar. */
export interface GradebookAssignment {
  readonly id: string;
  readonly dueAt: Date;
  readonly noSubmissionGrade?: GradeInput | null;
}

/** Estudiante (fila) del registro auxiliar: una matrícula con su vigencia. */
export interface GradebookStudent extends EnrollmentWindow {
  readonly enrollmentId: string;
}

/** Datos guardados de una celda: la nota y si hay entrega (y si fue tardía). */
export interface GradebookCell {
  readonly assignmentId: string;
  readonly enrollmentId: string;
  readonly grade?: GradeEntry | null;
  /** Última versión aceptada; `null`/`undefined` si no entregó. */
  readonly submission?: { readonly isLate: boolean } | null;
}

export interface BuildGradebookInput {
  readonly assignments: readonly GradebookAssignment[];
  readonly students: readonly GradebookStudent[];
  /** Solo celdas con nota o entrega; las que faltan se toman vacías. */
  readonly cells: readonly GradebookCell[];
  /** Instante de referencia para la NE virtual (lo pasa la API). */
  readonly now: Date;
  /** Tabla de literales (RN-04, RF-61). Por defecto AD/A/B/C. */
  readonly scale?: LiteralScale;
}

/** Promedio con su literal. Sin notas que cuenten es `NO_GRADES` (D-026). */
export type AverageSummary =
  | {
      readonly status: 'OK';
      readonly rounded: number;
      readonly literal: string;
      readonly counted: number;
      readonly exempt: number;
    }
  | { readonly status: 'NO_GRADES'; readonly counted: 0; readonly exempt: number };

/** Celda calculada: evaluación efectiva + datos de entrega. */
export interface GradebookEntry extends EffectiveEntry {
  readonly assignmentId: string;
  /** La matrícula estaba vigente al vencer la tarea. */
  readonly neEligible: boolean;
  readonly hasSubmission: boolean;
  readonly isLate: boolean;
}

/** Conteos de entrega (RF-49). */
export interface DeliveryCounts {
  /** Entregas a tiempo. */
  readonly onTime: number;
  /** Entregas tardías (RN-06: sin descuento). */
  readonly late: number;
  /** Celdas con NE efectiva (guardada o virtual). */
  readonly ne: number;
}

export interface GradebookRow {
  readonly enrollmentId: string;
  /** En el mismo orden que `assignments`. */
  readonly entries: readonly GradebookEntry[];
  readonly average: AverageSummary;
  /** Promedio con el literal de riesgo (A5). */
  readonly atRisk: boolean;
}

export interface GradebookColumn {
  readonly assignmentId: string;
  readonly average: AverageSummary;
  readonly counts: DeliveryCounts;
}

export interface GradebookDashboard {
  /** Estudiantes por literal de su promedio, en el orden de la tabla. */
  readonly distribution: Readonly<Record<string, number>>;
  /** Estudiantes sin notas que cuenten (D-026). */
  readonly noGrades: number;
  readonly counts: DeliveryCounts;
  /** Literal que se considera en riesgo (A5: C con la tabla por defecto). */
  readonly riskLiteral: string;
  /** Matrículas en riesgo, en el orden de `students`. */
  readonly atRisk: readonly string[];
}

export interface Gradebook {
  readonly rows: readonly GradebookRow[];
  readonly columns: readonly GradebookColumn[];
  readonly dashboard: GradebookDashboard;
}

/**
 * Promedio con literal (RN-02..04, RN-07, D-026) sobre entradas efectivas:
 * las que no tienen nota no cuentan.
 */
export function summarizeAverage(
  entries: readonly EffectiveEntry[],
  scale: LiteralScale = DEFAULT_LITERAL_SCALE,
): AverageSummary {
  const gradeEntries: GradeEntry[] = [];
  for (const entry of entries) {
    if (entry.state === 'EXEMPT') gradeEntries.push({ state: 'EXEMPT' });
    else if (entry.state !== null) {
      gradeEntries.push({ state: entry.state, value: entry.value as string });
    }
  }
  const result = calculateAverage(gradeEntries);
  if (result.status === 'NO_GRADES') return result;
  return {
    status: 'OK',
    rounded: result.rounded,
    literal: toLiteral(result.rounded, scale),
    counted: result.counted,
    exempt: result.exempt,
  };
}

/** Literal del tramo que contiene la nota mínima (C con la tabla por defecto). */
export function riskLiteralOf(scale: LiteralScale = DEFAULT_LITERAL_SCALE): string {
  assertLiteralScale(scale);
  return toLiteral(GRADE_MIN, scale);
}

/**
 * Registro auxiliar (RF-47..49): matriz de evaluaciones efectivas con NE
 * virtual (A2), promedio por estudiante y por tarea con el redondeo único y
 * el literal del motor (RN-02..05, RN-07), distribución por literal,
 * conteos a tiempo/tarde/NE y estudiantes en riesgo (A5). Promedios al leer
 * (A6). Función pura: no muta la entrada.
 * @throws GradingError `INVALID_INPUT` ante ids repetidos o celdas de
 *   tareas/matrículas que no están en la entrada, o fechas inválidas;
 *   `INVALID_GRADE`, `INVALID_STATE` o `INVALID_SCALE` del motor.
 */
export function buildGradebook(input: BuildGradebookInput): Gradebook {
  const { assignments, students, cells, now } = input;
  const scale = input.scale ?? DEFAULT_LITERAL_SCALE;
  assertDate(now, 'now');
  const riskLiteral = riskLiteralOf(scale);

  const assignmentIds = uniqueIds(
    assignments.map((a) => a.id),
    'tarea',
  );
  const enrollmentIds = uniqueIds(
    students.map((s) => s.enrollmentId),
    'matrícula',
  );

  const cellMap = new Map<string, GradebookCell>();
  for (const cell of cells) {
    if (!assignmentIds.has(cell.assignmentId)) {
      throw new GradingError(
        'INVALID_INPUT',
        `Celda de una tarea desconocida: ${cell.assignmentId}.`,
      );
    }
    if (!enrollmentIds.has(cell.enrollmentId)) {
      throw new GradingError(
        'INVALID_INPUT',
        `Celda de una matrícula desconocida: ${cell.enrollmentId}.`,
      );
    }
    const key = cellKey(cell.assignmentId, cell.enrollmentId);
    if (cellMap.has(key)) {
      throw new GradingError(
        'INVALID_INPUT',
        `Celda repetida: ${cell.assignmentId}/${cell.enrollmentId}.`,
      );
    }
    cellMap.set(key, cell);
  }

  const columnEntries: EffectiveEntry[][] = assignments.map(() => []);
  const columnCounts = assignments.map(() => ({ onTime: 0, late: 0, ne: 0 }));

  const rows: GradebookRow[] = students.map((student) => {
    const entries = assignments.map((assignment, index): GradebookEntry => {
      const cell = cellMap.get(cellKey(assignment.id, student.enrollmentId));
      const hasSubmission = cell?.submission !== null && cell?.submission !== undefined;
      const isLate = hasSubmission && cell?.submission?.isLate === true;
      const neEligible = isNeEligible(student, assignment.dueAt);
      const effective = resolveEffectiveEntry({
        grade: cell?.grade,
        hasSubmission,
        dueAt: assignment.dueAt,
        now,
        noSubmissionGrade: assignment.noSubmissionGrade,
        neEligible,
      });

      columnEntries[index].push(effective);
      const counts = columnCounts[index];
      if (hasSubmission) {
        if (isLate) counts.late += 1;
        else counts.onTime += 1;
      }
      if (effective.state === 'NE') counts.ne += 1;

      return { ...effective, assignmentId: assignment.id, neEligible, hasSubmission, isLate };
    });

    const average = summarizeAverage(entries, scale);
    const atRisk = average.status === 'OK' && average.literal === riskLiteral;
    return { enrollmentId: student.enrollmentId, entries, average, atRisk };
  });

  const columns: GradebookColumn[] = assignments.map((assignment, index) => ({
    assignmentId: assignment.id,
    average: summarizeAverage(columnEntries[index], scale),
    counts: columnCounts[index],
  }));

  const distribution: Record<string, number> = {};
  for (const band of [...scale].sort((a, b) => b.min - a.min)) distribution[band.literal] = 0;
  let noGrades = 0;
  for (const row of rows) {
    if (row.average.status === 'OK') distribution[row.average.literal] += 1;
    else noGrades += 1;
  }

  const counts = columnCounts.reduce(
    (total, c) => ({
      onTime: total.onTime + c.onTime,
      late: total.late + c.late,
      ne: total.ne + c.ne,
    }),
    { onTime: 0, late: 0, ne: 0 },
  );

  return {
    rows,
    columns,
    dashboard: {
      distribution,
      noGrades,
      counts,
      riskLiteral,
      atRisk: rows.filter((r) => r.atRisk).map((r) => r.enrollmentId),
    },
  };
}

function cellKey(assignmentId: string, enrollmentId: string): string {
  return `${assignmentId}\u0000${enrollmentId}`;
}

function uniqueIds(ids: readonly string[], label: string): Set<string> {
  const set = new Set<string>();
  for (const id of ids) {
    if (set.has(id)) throw new GradingError('INVALID_INPUT', `Id de ${label} repetido: ${id}.`);
    set.add(id);
  }
  return set;
}
