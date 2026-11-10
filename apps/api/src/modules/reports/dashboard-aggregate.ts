import {
  GRADE_LITERALS,
  gradeLabel,
  LITERAL_RISK,
  sectionLabel,
  summarizeAverage,
  type AverageSummary,
  type DeliveryCounts,
  type EducationLevel,
  type EffectiveEntry,
  type GradebookDashboard,
  type GradingScale,
  type LiteralScale,
} from '@aula/shared';

// Agregados del dashboard institucional (RF-60). No recalcula: suma lo que ya devolvió el motor
// por curso-sección (GradebookDashboard de buildGradebook) y, para el promedio del grado o la
// sección, pasa las mismas evaluaciones efectivas a summarizeAverage (un solo redondeo y el
// literal de la tabla vigente, RN-02..04). Sin nombres: solo conteos (RNF-09).
//
// Tres niveles (09/11/2026): se agrupa por (nivel, grado). En escala literal (INICIAL y PRIMARIA)
// no hay promedio: el motor devuelve en `distribution` los logros del bimestre (PeriodAchievement)
// y marca en riesgo el logro C. Esos conteos van a `achievements`, nunca a `distribution` (que es
// la de promedios con la tabla de RF-61) ni al promedio del grupo.

export interface DashboardInput {
  level: EducationLevel;
  gradingScale: GradingScale;
  gradeLevel: number;
  sectionId: string;
  code: string;
  students: { studentId: string; atRisk: boolean; cells: EffectiveEntry[] }[];
  dashboard: GradebookDashboard;
}

export type BucketScale = GradingScale | 'MIXED';

export interface DashboardBucket {
  /** Escala del grupo; MIXED solo en el total con niveles de ambas escalas. */
  gradingScale: BucketScale;
  /**
   * Promedio de las evaluaciones efectivas de escala numérica del grupo (motor). En un grupo solo
   * literal es LITERAL_SCALE (sin promedio).
   */
  average: AverageSummary;
  /** Promedios estudiante-curso por literal (escala numérica, suma de las distribuciones). */
  distribution: Record<string, number>;
  /** Logros del bimestre estudiante-curso por literal AD/A/B/C (escala literal). */
  achievements: Record<string, number>;
  /** Estudiante-curso sin notas que cuenten (numérica, D-026) o sin logro (literal). */
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
  /** "3.° Primaria A", "5 años C". */
  label: string;
}

export interface DashboardGrade extends DashboardBucket {
  level: EducationLevel;
  gradeLevel: number;
  /** "3.° Primaria", "5 años". */
  label: string;
  sections: DashboardSection[];
}

export interface DashboardAggregate {
  /** Literales de la tabla de promedios (RF-61), escala numérica. */
  literals: string[];
  /** Literal en riesgo de la escala numérica; null si no hay cursos de esa escala. */
  riskLiteral: string | null;
  /** Literales de logro (escala literal). */
  achievementLiterals: string[];
  /** Logro en riesgo (escala literal); null si no hay cursos de esa escala. */
  achievementRiskLiteral: string | null;
  total: DashboardBucket;
  /** Total por escala (null si no hay cursos de esa escala): cada tabla de la web tiene el suyo. */
  totalByScale: Record<GradingScale, DashboardBucket | null>;
  grades: DashboardGrade[];
}

const LEVEL_ORDER: Record<EducationLevel, number> = { INICIAL: 0, PRIMARIA: 1, SECUNDARIA: 2 };

function scaleOf(items: DashboardInput[]): BucketScale {
  const scales = new Set(items.map((i) => i.gradingScale));
  if (scales.size > 1) return 'MIXED';
  return scales.has('LITERAL_ADABC') ? 'LITERAL_ADABC' : 'NUMERIC_0_20';
}

function bucket(items: DashboardInput[], scale: LiteralScale): DashboardBucket {
  const distribution: Record<string, number> = Object.fromEntries(scale.map((b) => [b.literal, 0]));
  const achievements: Record<string, number> = Object.fromEntries(
    GRADE_LITERALS.map((l) => [l, 0]),
  );
  const numericEntries: EffectiveEntry[] = [];
  const students = new Set<string>();
  const risky = new Set<string>();
  const counts = { onTime: 0, late: 0, ne: 0 };
  let noGrades = 0;
  let atRiskEntries = 0;
  let literalExempt = 0;
  for (const item of items) {
    const literal = item.gradingScale === 'LITERAL_ADABC';
    const target = literal ? achievements : distribution;
    for (const [lit, n] of Object.entries(item.dashboard.distribution)) {
      target[lit] = (target[lit] ?? 0) + n;
    }
    noGrades += item.dashboard.noGrades;
    atRiskEntries += item.dashboard.atRisk.length;
    counts.onTime += item.dashboard.counts.onTime;
    counts.late += item.dashboard.counts.late;
    counts.ne += item.dashboard.counts.ne;
    for (const s of item.students) {
      students.add(s.studentId);
      if (s.atRisk) risky.add(s.studentId);
      if (literal) literalExempt += s.cells.filter((c) => c.state === 'EXEMPT').length;
      else numericEntries.push(...s.cells);
    }
  }
  const gradingScale = scaleOf(items);
  const average: AverageSummary =
    gradingScale === 'LITERAL_ADABC'
      ? { status: 'LITERAL_SCALE', counted: 0, exempt: literalExempt }
      : summarizeAverage(numericEntries, scale);
  return {
    gradingScale,
    average,
    distribution,
    achievements,
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
  const byGrade = new Map<string, DashboardInput[]>();
  for (const item of items) {
    const key = `${item.level}:${item.gradeLevel}`;
    const list = byGrade.get(key) ?? [];
    list.push(item);
    byGrade.set(key, list);
  }
  const grades: DashboardGrade[] = [...byGrade.values()]
    .map((list) => {
      const { level, gradeLevel } = list[0];
      const sections = new Map<string, DashboardInput[]>();
      for (const item of list) {
        const s = sections.get(item.sectionId) ?? [];
        s.push(item);
        sections.set(item.sectionId, s);
      }
      return {
        level,
        gradeLevel,
        label: gradeLabel(level, gradeLevel),
        ...bucket(list, scale),
        sections: [...sections.entries()]
          .map(([sectionId, s]) => ({
            sectionId,
            code: s[0].code,
            label: sectionLabel(level, gradeLevel, s[0].code),
            ...bucket(s, scale),
          }))
          .sort((a, b) => a.code.localeCompare(b.code, 'es')),
      };
    })
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.gradeLevel - b.gradeLevel);
  const numericItems = items.filter((i) => i.gradingScale === 'NUMERIC_0_20');
  const literalItems = items.filter((i) => i.gradingScale === 'LITERAL_ADABC');
  const numeric = numericItems[0];
  const hasLiteral = literalItems.length > 0;
  return {
    literals: scale.map((b) => b.literal),
    riskLiteral: numeric?.dashboard.riskLiteral ?? null,
    achievementLiterals: [...GRADE_LITERALS],
    achievementRiskLiteral: hasLiteral ? LITERAL_RISK : null,
    total: bucket(items, scale),
    totalByScale: {
      NUMERIC_0_20: numeric ? bucket(numericItems, scale) : null,
      LITERAL_ADABC: hasLiteral ? bucket(literalItems, scale) : null,
    },
    grades,
  };
}
