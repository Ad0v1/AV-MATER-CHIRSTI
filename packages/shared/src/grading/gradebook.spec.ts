import { describe, expect, it } from 'vitest';
import { GradingError } from './errors';
import {
  buildGradebook,
  riskLiteralOf,
  summarizeAverage,
  type BuildGradebookInput,
  type GradebookCell,
} from './gradebook';
import type { LiteralScale } from './literal-scale';

const now = new Date('2026-05-20T12:00:00.000Z');
const past = new Date('2026-05-10T23:59:00.000Z');
const future = new Date('2026-05-30T23:59:00.000Z');
const start = new Date('2026-03-01T00:00:00.000Z');

const assignments = [
  { id: 't1', dueAt: past, noSubmissionGrade: null },
  { id: 't2', dueAt: past, noSubmissionGrade: '05' },
  { id: 't3', dueAt: future },
];

function input(
  cells: GradebookCell[],
  extra: Partial<BuildGradebookInput> = {},
): BuildGradebookInput {
  return {
    assignments,
    students: [
      { enrollmentId: 'e1', effectiveFrom: start, effectiveTo: null },
      { enrollmentId: 'e2', effectiveFrom: start, effectiveTo: null },
    ],
    cells,
    now,
    ...extra,
  };
}

const onTime = { isLate: false };
const late = { isLate: true };

describe('buildGradebook', () => {
  it('RF-47/RN-02/RN-03: promedio simple por estudiante, redondeo único y literal', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '12.5' },
          submission: onTime,
        },
        {
          assignmentId: 't2',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '12.4' },
          submission: late,
        },
        {
          assignmentId: 't1',
          enrollmentId: 'e2',
          grade: { state: 'GRADED', value: '18' },
          submission: onTime,
        },
        {
          assignmentId: 't2',
          enrollmentId: 'e2',
          grade: { state: 'GRADED', value: '19' },
          submission: onTime,
        },
      ]),
    );
    // (12.5 + 12.4) / 2 = 12.45 → 12 (un solo redondeo), literal B.
    expect(book.rows[0].average).toEqual({
      status: 'OK',
      rounded: 12,
      literal: 'B',
      counted: 2,
      exempt: 0,
    });
    expect(book.rows[1].average).toMatchObject({ rounded: 19, literal: 'AD' });
    expect(book.rows[0].entries.map((e) => e.assignmentId)).toEqual(['t1', 't2', 't3']);
  });

  it('RF-48: promedio por actividad con literal; tarea sin notas es NO_GRADES (D-026)', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '13.5' },
          submission: onTime,
        },
        {
          assignmentId: 't1',
          enrollmentId: 'e2',
          grade: { state: 'GRADED', value: '14' },
          submission: onTime,
        },
        { assignmentId: 't2', enrollmentId: 'e1', submission: onTime },
        { assignmentId: 't2', enrollmentId: 'e2', submission: late },
      ]),
    );
    // (13.5 + 14) / 2 = 13.75 → 14, literal A.
    expect(book.columns[0].average).toMatchObject({ status: 'OK', rounded: 14, literal: 'A' });
    expect(book.columns[1].average).toEqual({ status: 'NO_GRADES', counted: 0, exempt: 0 });
    expect(book.columns[2].average.status).toBe('NO_GRADES');
  });

  it('RF-44/RN-05: NE virtual de tareas vencidas sin entrega cuenta en el promedio', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '15' },
          submission: onTime,
        },
      ]),
    );
    const [t1, t2, t3] = book.rows[0].entries;
    expect(t1).toMatchObject({ state: 'GRADED', value: '15.00', virtual: false });
    expect(t2).toMatchObject({ state: 'NE', value: '5.00', virtual: true, neEligible: true });
    expect(t3).toMatchObject({ state: null, hasSubmission: false });
    // (15 + 5) / 2 = 10 → C.
    expect(book.rows[0].average).toMatchObject({ rounded: 10, literal: 'C', counted: 2 });
    // e2: NE 0.00 (t1) y NE 5.00 (t2) → 2.5 → 3.
    expect(book.rows[1].average).toMatchObject({ rounded: 3, literal: 'C' });
  });

  it('RN-07: EXEMPT queda fuera del promedio y se cuenta aparte', () => {
    const book = buildGradebook(
      input([
        { assignmentId: 't1', enrollmentId: 'e1', grade: { state: 'EXEMPT' } },
        {
          assignmentId: 't2',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '17' },
          submission: onTime,
        },
      ]),
    );
    expect(book.rows[0].average).toMatchObject({ rounded: 17, counted: 1, exempt: 1 });
    expect(book.columns[0].average).toMatchObject({ counted: 1, exempt: 1 });
  });

  it('D-026: estudiante solo con exoneraciones o sin notas queda NO_GRADES, nunca 0', () => {
    const book = buildGradebook({
      assignments: [{ id: 't3', dueAt: future }],
      students: [
        { enrollmentId: 'e1', effectiveFrom: start },
        { enrollmentId: 'e2', effectiveFrom: start },
      ],
      cells: [{ assignmentId: 't3', enrollmentId: 'e1', grade: { state: 'EXEMPT' } }],
      now,
    });
    expect(book.rows[0].average).toEqual({ status: 'NO_GRADES', counted: 0, exempt: 1 });
    expect(book.rows[1].average).toEqual({ status: 'NO_GRADES', counted: 0, exempt: 0 });
    expect(book.rows.every((r) => !r.atRisk)).toBe(true);
    expect(book.dashboard.noGrades).toBe(2);
    expect(book.dashboard.distribution).toEqual({ AD: 0, A: 0, B: 0, C: 0 });
  });

  it('RF-49: distribución AD/A/B/C, conteos a tiempo/tarde/NE y estudiantes en riesgo (A5)', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '20' },
          submission: onTime,
        },
        {
          assignmentId: 't2',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '18' },
          submission: late,
        },
        { assignmentId: 't3', enrollmentId: 'e1', submission: onTime },
        // e2 no entrega nada: t1 NE 0 y t2 NE 5 virtuales.
      ]),
    );
    expect(book.dashboard.distribution).toEqual({ AD: 1, A: 0, B: 0, C: 1 });
    expect(Object.keys(book.dashboard.distribution)).toEqual(['AD', 'A', 'B', 'C']);
    expect(book.dashboard.noGrades).toBe(0);
    expect(book.dashboard.counts).toEqual({ onTime: 2, late: 1, ne: 2 });
    expect(book.columns.map((c) => c.counts)).toEqual([
      { onTime: 1, late: 0, ne: 1 },
      { onTime: 0, late: 1, ne: 1 },
      { onTime: 1, late: 0, ne: 0 },
    ]);
    expect(book.dashboard.riskLiteral).toBe('C');
    expect(book.dashboard.atRisk).toEqual(['e2']);
    expect(book.rows[1].atRisk).toBe(true);
  });

  it('RN-06: una entrega tardía se cuenta como tardía y se promedia sin descuento', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'GRADED', value: '16' },
          submission: late,
        },
      ]),
    );
    expect(book.rows[0].entries[0]).toMatchObject({ isLate: true, value: '16.00' });
    expect(book.columns[0].average).toMatchObject({ rounded: 8 }); // 16 y NE 0 de e2.
  });

  it('RF-45: NE guardada con entrega tardía se marca para recalificar y sigue contando', () => {
    const book = buildGradebook(
      input([
        {
          assignmentId: 't1',
          enrollmentId: 'e1',
          grade: { state: 'NE', value: '0' },
          submission: late,
        },
      ]),
    );
    expect(book.rows[0].entries[0]).toMatchObject({
      state: 'NE',
      needsRegrade: true,
      isLate: true,
    });
    expect(book.columns[0].counts).toEqual({ onTime: 0, late: 1, ne: 2 });
  });

  it('RF-44: matrícula que empezó después del vencimiento no recibe NE virtual', () => {
    const book = buildGradebook({
      assignments: [{ id: 't1', dueAt: past }],
      students: [{ enrollmentId: 'e9', effectiveFrom: new Date('2026-05-15T00:00:00.000Z') }],
      cells: [],
      now,
    });
    expect(book.rows[0].entries[0]).toMatchObject({ state: null, neEligible: false });
    expect(book.rows[0].average.status).toBe('NO_GRADES');
    expect(book.dashboard.counts.ne).toBe(0);
  });

  it('RN-04: usa la tabla de literales recibida y su tramo más bajo como riesgo', () => {
    const scale: LiteralScale = [
      { literal: 'LOGRADO', min: 11, max: 20 },
      { literal: 'INICIO', min: 0, max: 10 },
    ];
    const book = buildGradebook(
      input(
        [
          {
            assignmentId: 't1',
            enrollmentId: 'e1',
            grade: { state: 'GRADED', value: '11' },
            submission: onTime,
          },
          {
            assignmentId: 't2',
            enrollmentId: 'e1',
            grade: { state: 'GRADED', value: '11' },
            submission: onTime,
          },
        ],
        { scale },
      ),
    );
    expect(book.dashboard.distribution).toEqual({ LOGRADO: 1, INICIO: 1 });
    expect(book.dashboard.riskLiteral).toBe('INICIO');
    expect(book.dashboard.atRisk).toEqual(['e2']);
  });

  it('RN-04: una tabla inválida lanza INVALID_SCALE', () => {
    expect(() => buildGradebook(input([], { scale: [{ literal: 'X', min: 0, max: 5 }] }))).toThrow(
      expect.objectContaining({ code: 'INVALID_SCALE' }),
    );
  });

  it('RF-47: registro vacío (sin tareas ni estudiantes)', () => {
    const book = buildGradebook({ assignments: [], students: [], cells: [], now });
    expect(book.rows).toEqual([]);
    expect(book.columns).toEqual([]);
    expect(book.dashboard).toMatchObject({
      noGrades: 0,
      atRisk: [],
      counts: { onTime: 0, late: 0, ne: 0 },
    });
  });

  it('RF-47: no muta la entrada', () => {
    const cells: GradebookCell[] = [
      {
        assignmentId: 't1',
        enrollmentId: 'e1',
        grade: { state: 'GRADED', value: '05' },
        submission: onTime,
      },
    ];
    const data = input(cells);
    const snapshot = JSON.stringify(data);
    buildGradebook(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('RF-47: rechaza ids repetidos, celdas desconocidas o repetidas y fecha inválida', () => {
    const cell = { assignmentId: 't1', enrollmentId: 'e1' };
    expect(() =>
      buildGradebook(input([], { assignments: [assignments[0], assignments[0]] })),
    ).toThrow(/tarea repetido/);
    expect(() =>
      buildGradebook(
        input([], {
          students: [
            { enrollmentId: 'e1', effectiveFrom: start },
            { enrollmentId: 'e1', effectiveFrom: start },
          ],
        }),
      ),
    ).toThrow(/matrícula repetido/);
    expect(() => buildGradebook(input([{ ...cell, assignmentId: 'tx' }]))).toThrow(
      /tarea desconocida/,
    );
    expect(() => buildGradebook(input([{ ...cell, enrollmentId: 'ex' }]))).toThrow(
      /matrícula desconocida/,
    );
    expect(() => buildGradebook(input([cell, cell]))).toThrow(/Celda repetida/);
    expect(() => buildGradebook(input([], { now: new Date('x') }))).toThrow(GradingError);
  });
});

describe('summarizeAverage y riskLiteralOf', () => {
  it('RN-07: ignora entradas sin nota y EXEMPT', () => {
    expect(
      summarizeAverage([
        { state: null, value: null, virtual: false, needsRegrade: false },
        { state: 'EXEMPT', value: null, virtual: false, needsRegrade: false },
        { state: 'NE', value: '10.50', virtual: true, needsRegrade: false },
      ]),
    ).toEqual({ status: 'OK', rounded: 11, literal: 'B', counted: 1, exempt: 1 });
  });

  it('RN-04: el riesgo por defecto es C (A5)', () => {
    expect(riskLiteralOf()).toBe('C');
  });
});
