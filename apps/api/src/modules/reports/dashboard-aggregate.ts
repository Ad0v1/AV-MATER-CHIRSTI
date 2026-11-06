import {
  summarizeAverage,
  type AverageSummary,
  type DeliveryCounts,
  type EffectiveEntry,
  type GradebookDashboard,
  type LiteralScale,
} from '@aula/shared';

// Agregados del dashboard institucional (RF-60). No recalcula: suma lo que ya devolvió el motor
// por curso-sección (GradebookDashboard de buildGradebook) y, para el promedio del grado o la
// sección, pasa las mismas evaluaciones efectivas a summarizeAverage (un solo redondeo y el
// literal de la tabla vigente, RN-02..04). Sin nombres: solo conteos (RNF-09).

export interface DashboardInput {
  gradeLevel: number;
  sectionId: string;
  code: string;
  students: { studentId: string; atRisk: boolean; cells: EffectiveEntry[] }[];
  dashboard: GradebookDashboard;
}

export interface DashboardBucket {
  /** Promedio de todas las evaluaciones efectivas del grupo (motor). */
  average: AverageSummary;
  /** Promedios estudiante-curso por literal (suma de las distribuciones del motor). */
  distribution: Record<string, number>;
  /** Estudiante-curso sin notas que cuenten (D-026). */
  noGrades: number;
  /** Estudiantes distintos con al menos un curso en riesgo. */
  atRiskStudents: number;
  /** Pares estudiante-curso en riesgo. */
  atRiskEntries: number;
  /** Estudiantes distintos en el registro. */
  students: number;
  counts: DeliveryCounts;
  courseSections: number;
}

export interface DashboardSection extends DashboardBucket {
  sectionId: string;
  code: string;
}

export interface DashboardGrade extends DashboardBucket {
  gradeLevel: number;
  sections: DashboardSection[];
}

export interface DashboardAggregate {
  literals: string[];
  riskLiteral: string | null;
  total: DashboardBucket;
  grades: DashboardGrade[];
}

function bucket(items: DashboardInput[], scale: LiteralScale): DashboardBucket {
  const distribution: Record<string, number> = Object.fromEntries(scale.map((b) => [b.literal, 0]));
  const entries: EffectiveEntry[] = [];
  const students = new Set<string>();
  const risky = new Set<string>();
  const counts = { onTime: 0, late: 0, ne: 0 };
  let noGrades = 0;
  let atRiskEntries = 0;
  for (const item of items) {
    for (const [literal, n] of Object.entries(item.dashboard.distribution)) {
      distribution[literal] = (distribution[literal] ?? 0) + n;
    }
    noGrades += item.dashboard.noGrades;
    atRiskEntries += item.dashboard.atRisk.length;
    counts.onTime += item.dashboard.counts.onTime;
    counts.late += item.dashboard.counts.late;
    counts.ne += item.dashboard.counts.ne;
    for (const s of item.students) {
      students.add(s.studentId);
      if (s.atRisk) risky.add(s.studentId);
      entries.push(...s.cells);
    }
  }
  return {
    average: summarizeAverage(entries, scale),
    distribution,
    noGrades,
    atRiskStudents: risky.size,
    atRiskEntries,
    students: students.size,
    counts,
    courseSections: items.length,
  };
}

export function aggregateDashboard(
  items: DashboardInput[],
  scale: LiteralScale,
): DashboardAggregate {
  const byGrade = new Map<number, Map<string, DashboardInput[]>>();
  for (const item of items) {
    const sections = byGrade.get(item.gradeLevel) ?? new Map<string, DashboardInput[]>();
    byGrade.set(item.gradeLevel, sections);
    const list = sections.get(item.sectionId) ?? [];
    list.push(item);
    sections.set(item.sectionId, list);
  }
  const grades: DashboardGrade[] = [...byGrade.entries()]
    .sort(([a], [b]) => a - b)
    .map(([gradeLevel, sections]) => ({
      gradeLevel,
      ...bucket([...sections.values()].flat(), scale),
      sections: [...sections.entries()]
        .map(([sectionId, list]) => ({ sectionId, code: list[0].code, ...bucket(list, scale) }))
        .sort((a, b) => a.code.localeCompare(b.code, 'es')),
    }));
  return {
    literals: scale.map((b) => b.literal),
    riskLiteral: items[0]?.dashboard.riskLiteral ?? null,
    total: bucket(items, scale),
    grades,
  };
}
