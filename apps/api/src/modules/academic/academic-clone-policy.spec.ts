import {
  cloneYearIssue,
  planClone,
  teacherIdsToCheck,
  type CloneSourceSection,
} from './academic-clone-policy.js';

const cs = (courseId: string, teacherId: string | null, isActive = true, courseActive = true) => ({
  courseId,
  teacherId,
  isActive,
  course: { isActive: courseActive },
});

const source: CloneSourceSection[] = [
  {
    gradeLevel: 3,
    code: 'B',
    isActive: true,
    courseSections: [cs('c2', 't1'), cs('c1', 't2')],
  },
  {
    gradeLevel: 1,
    code: 'A',
    isActive: true,
    courseSections: [
      cs('c1', 't1'),
      cs('c2', 't3'), // docente que ya no es elegible
      cs('c3', null),
      cs('c4', 't1', false), // curso-sección inactivo
      cs('c5', 't1', true, false), // curso inactivo
    ],
  },
  { gradeLevel: 2, code: 'Z', isActive: false, courseSections: [cs('c1', 't1')] },
  { gradeLevel: 4, code: 'A', isActive: true, courseSections: [] },
];

describe('planClone (RF-15)', () => {
  it('copia solo secciones activas, ordenadas por grado y código, con cursos activos', () => {
    const plan = planClone(source, { copyTeachers: false });
    expect(plan.sections.map((s) => `${s.gradeLevel}${s.code}`)).toEqual(['1A', '3B', '4A']);
    expect(plan.sections[0].courseSections.map((c) => c.courseId)).toEqual(['c1', 'c2', 'c3']);
    expect(plan.sections[1].courseSections.map((c) => c.courseId)).toEqual(['c1', 'c2']);
    expect(plan.sections[2].courseSections).toEqual([]);
  });

  it('D-029: sin copyTeachers todos los curso-sección quedan sin docente', () => {
    const plan = planClone(source, { copyTeachers: false, eligibleTeacherIds: new Set(['t1']) });
    expect(plan.sections.flatMap((s) => s.courseSections).every((c) => c.teacherId === null)).toBe(
      true,
    );
    expect(plan.created).toEqual({ sections: 3, courseSections: 5, teachersAssigned: 0 });
    expect(plan.skipped).toEqual({
      inactiveSections: 1,
      inactiveCourseSections: 1,
      inactiveCourses: 1,
      teachersNotActive: 0,
    });
  });

  it('con copyTeachers conserva solo docentes elegibles; el resto queda en null y se cuenta', () => {
    const plan = planClone(source, {
      copyTeachers: true,
      eligibleTeacherIds: new Set(['t1', 't2']),
    });
    expect(plan.sections[0].courseSections).toEqual([
      { courseId: 'c1', teacherId: 't1' },
      { courseId: 'c2', teacherId: null },
      { courseId: 'c3', teacherId: null },
    ]);
    expect(plan.sections[1].courseSections).toEqual([
      { courseId: 'c1', teacherId: 't2' },
      { courseId: 'c2', teacherId: 't1' },
    ]);
    expect(plan.created).toEqual({ sections: 3, courseSections: 5, teachersAssigned: 3 });
    expect(plan.skipped.teachersNotActive).toBe(1);
  });

  it('con copyTeachers y sin lista de elegibles, ningún docente se copia', () => {
    const plan = planClone(source, { copyTeachers: true });
    expect(plan.created.teachersAssigned).toBe(0);
    expect(plan.skipped.teachersNotActive).toBe(4);
  });

  it('origen sin secciones activas: plan vacío', () => {
    const plan = planClone([{ gradeLevel: 1, code: 'A', isActive: false, courseSections: [] }], {
      copyTeachers: false,
    });
    expect(plan.sections).toEqual([]);
    expect(plan.created).toEqual({ sections: 0, courseSections: 0, teachersAssigned: 0 });
    expect(plan.skipped.inactiveSections).toBe(1);
  });

  it('no modifica la entrada', () => {
    const copy = structuredClone(source);
    planClone(source, { copyTeachers: true, eligibleTeacherIds: new Set(['t1']) });
    expect(source).toEqual(copy);
  });
});

describe('planClone, casos límite (RF-15)', () => {
  it('RF-15: curso-sección inactivo con curso inactivo cuenta solo como inactivo en su sección', () => {
    const plan = planClone(
      [
        {
          gradeLevel: 1,
          code: 'A',
          isActive: true,
          courseSections: [cs('c1', 't1', false, false)],
        },
      ],
      { copyTeachers: true, eligibleTeacherIds: new Set(['t1']) },
    );
    expect(plan.skipped).toMatchObject({ inactiveCourseSections: 1, inactiveCourses: 0 });
    expect(plan.created).toEqual({ sections: 1, courseSections: 0, teachersAssigned: 0 });
  });

  it('RF-15: docente de un curso inactivo no se cuenta como no activo', () => {
    const plan = planClone(
      [{ gradeLevel: 1, code: 'A', isActive: true, courseSections: [cs('c1', 't9', true, false)] }],
      { copyTeachers: true },
    );
    expect(plan.skipped.teachersNotActive).toBe(0);
  });

  it('RF-15: mismo grado ordena por código; sin copyTeachers ignora una lista de elegibles', () => {
    const plan = planClone(
      [
        { gradeLevel: 1, code: 'C', isActive: true, courseSections: [] },
        { gradeLevel: 1, code: 'A', isActive: true, courseSections: [] },
        { gradeLevel: 1, code: 'B', isActive: true, courseSections: [] },
      ],
      { copyTeachers: false, eligibleTeacherIds: new Set(['t1']) },
    );
    expect(plan.sections.map((s) => s.code)).toEqual(['A', 'B', 'C']);
  });

  it('RF-15: origen vacío (sin secciones) da plan vacío y sin ids que comprobar', () => {
    expect(planClone([], { copyTeachers: true }).sections).toEqual([]);
    expect(teacherIdsToCheck([])).toEqual([]);
  });

  it('RF-15: teacherIdsToCheck ignora secciones inactivas, cursos inactivos y docentes null', () => {
    expect(
      teacherIdsToCheck([
        { gradeLevel: 1, code: 'A', isActive: false, courseSections: [cs('c1', 'tX')] },
        {
          gradeLevel: 1,
          code: 'B',
          isActive: true,
          courseSections: [cs('c1', 'tY', false), cs('c2', 'tZ', true, false), cs('c3', null)],
        },
      ]),
    ).toEqual([]);
  });

  it('RF-15: cloneYearIssue con ids distintos y mismo número de año es SOURCE_NOT_EARLIER', () => {
    expect(cloneYearIssue({ id: 'a', year: 2026 }, { id: 'b', year: 2026 })).toBe(
      'SOURCE_NOT_EARLIER',
    );
  });
});

describe('teacherIdsToCheck (RF-15)', () => {
  it('ids únicos y ordenados de los curso-sección que se copiarían', () => {
    expect(teacherIdsToCheck(source)).toEqual(['t1', 't2', 't3']);
  });
});

describe('cloneYearIssue (RF-15)', () => {
  it('mismo año, origen posterior o igual: error; origen anterior: null', () => {
    expect(cloneYearIssue({ id: 'a', year: 2025 }, { id: 'a', year: 2025 })).toBe('SAME_YEAR');
    expect(cloneYearIssue({ id: 'a', year: 2027 }, { id: 'b', year: 2026 })).toBe(
      'SOURCE_NOT_EARLIER',
    );
    expect(cloneYearIssue({ id: 'a', year: 2025 }, { id: 'b', year: 2027 })).toBeNull();
  });
});
