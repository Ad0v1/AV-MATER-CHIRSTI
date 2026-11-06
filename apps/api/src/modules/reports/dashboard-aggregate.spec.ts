import { buildGradebook, DEFAULT_LITERAL_SCALE, summarizeAverage } from '@aula/shared';
import { describe, expect, it } from 'vitest';
import { aggregateDashboard, type DashboardInput } from './dashboard-aggregate.js';

// RF-60: el dashboard suma lo que devuelve el motor por curso-sección; no recalcula.

const now = new Date('2026-06-01T00:00:00Z');
const past = new Date('2026-05-01T00:00:00Z');
const from = new Date('2026-03-01T00:00:00Z');

/** Un curso-sección con una tarea vencida y notas por estudiante (null = sin entrega -> NE). */
function courseSection(
  gradeLevel: number,
  sectionId: string,
  code: string,
  grades: Record<string, string | null>,
  late: string[] = [],
): DashboardInput {
  const students = Object.keys(grades);
  const book = buildGradebook({
    assignments: [{ id: 'a1', dueAt: past, noSubmissionGrade: '0' }],
    students: students.map((s) => ({ enrollmentId: s, effectiveFrom: from, effectiveTo: null })),
    cells: students
      .filter((s) => grades[s] !== null)
      .map((s) => ({
        assignmentId: 'a1',
        enrollmentId: s,
        grade: { state: 'GRADED' as const, value: grades[s]! },
        submission: { isLate: late.includes(s) },
      })),
    now,
  });
  return {
    gradeLevel,
    sectionId,
    code,
    students: book.rows.map((r) => ({
      studentId: `stu-${r.enrollmentId}`,
      atRisk: r.atRisk,
      cells: [...r.entries],
    })),
    dashboard: book.dashboard,
  };
}

describe('aggregateDashboard', () => {
  const items = [
    courseSection(1, 's1', 'A', { e1: '18', e2: '12', e3: null }, ['e2']),
    courseSection(1, 's1', 'A', { e1: '15', e2: '8', e3: '20' }),
    courseSection(1, 's2', 'B', { e4: '14' }),
    courseSection(2, 's3', 'A', { e5: '5', e6: null }),
  ];
  const result = aggregateDashboard(items, DEFAULT_LITERAL_SCALE);

  it('agrupa por grado y sección, en orden', () => {
    expect(result.grades.map((g) => g.gradeLevel)).toEqual([1, 2]);
    expect(result.grades[0].sections.map((s) => s.code)).toEqual(['A', 'B']);
    expect(result.grades[0].sections[0].courseSections).toBe(2);
    expect(result.literals).toEqual(['AD', 'A', 'B', 'C']);
    expect(result.riskLiteral).toBe('C');
  });

  it('el promedio del grupo es summarizeAverage de las mismas evaluaciones efectivas', () => {
    const s1 = items.slice(0, 2).flatMap((i) => i.students.flatMap((s) => s.cells));
    expect(result.grades[0].sections[0].average).toEqual(
      summarizeAverage(s1, DEFAULT_LITERAL_SCALE),
    );
    const all = items.flatMap((i) => i.students.flatMap((s) => s.cells));
    expect(result.total.average).toEqual(summarizeAverage(all, DEFAULT_LITERAL_SCALE));
  });

  it('suma distribuciones, NE, a tiempo y tarde del motor', () => {
    const s1 = result.grades[0].sections[0];
    // CS1: e1 18 AD, e2 12 B, e3 NE 0 C. CS2: e1 15 A, e2 8 C, e3 20 AD.
    expect(s1.distribution).toEqual({ AD: 2, A: 1, B: 1, C: 2 });
    expect(s1.counts).toEqual({ onTime: 4, late: 1, ne: 1 });
    expect(result.total.counts.ne).toBe(2);
  });

  it('cuenta estudiantes en riesgo distintos y pares estudiante-curso, sin nombres', () => {
    const s1 = result.grades[0].sections[0];
    expect(s1.atRiskEntries).toBe(2); // e3 en CS1, e2 en CS2
    expect(s1.atRiskStudents).toBe(2);
    expect(s1.students).toBe(3);
    expect(result.total.atRiskStudents).toBe(4); // + e5 y e6
    expect(JSON.stringify(result)).not.toContain('stu-');
  });

  it('sin cursos-sección devuelve ceros y NO_GRADES', () => {
    const empty = aggregateDashboard([], DEFAULT_LITERAL_SCALE);
    expect(empty.grades).toEqual([]);
    expect(empty.total.average.status).toBe('NO_GRADES');
    expect(empty.total.distribution).toEqual({ AD: 0, A: 0, B: 0, C: 0 });
    expect(empty.riskLiteral).toBeNull();
  });
});
