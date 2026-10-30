// RF-15: qué se copia al clonar la estructura de un año en otro (INFORME 1 de F6, regla A2).
// Lógica pura (sin Prisma), probada en academic-clone-policy.spec.ts.

export type CloneSourceCourseSection = {
  courseId: string;
  teacherId: string | null;
  isActive: boolean;
  course: { isActive: boolean };
};

export type CloneSourceSection = {
  gradeLevel: number;
  code: string;
  isActive: boolean;
  courseSections: CloneSourceCourseSection[];
};

export type CloneCreated = { sections: number; courseSections: number; teachersAssigned: number };

export type CloneSkipped = {
  /** Secciones inactivas del origen (no se copian ni ellas ni sus cursos). */
  inactiveSections: number;
  /** Curso-sección inactivos dentro de secciones activas. */
  inactiveCourseSections: number;
  /** Curso-sección activos cuyo curso está inactivo. */
  inactiveCourses: number;
  /** Con copyTeachers: docentes que ya no son TEACHER y ACTIVE (el curso queda sin docente). */
  teachersNotActive: number;
};

export type ClonePlanSection = {
  gradeLevel: number;
  code: string;
  courseSections: { courseId: string; teacherId: string | null }[];
};

export type ClonePlan = {
  sections: ClonePlanSection[];
  created: CloneCreated;
  skipped: CloneSkipped;
};

/**
 * Calcula lo que se crea en el año destino:
 * - solo secciones activas y, de cada una, curso-sección activos con curso activo;
 * - teacherId null por defecto (D-029); con `copyTeachers`, el docente se conserva solo si está
 *   en `eligibleTeacherIds` (rol TEACHER y estado ACTIVE); si no, null y suma teachersNotActive;
 * - no se copian períodos, matrículas, vínculos ni contenidos (no llegan a esta función).
 * Orden estable: grado, código y id del curso.
 */
export function planClone(
  source: readonly CloneSourceSection[],
  options: { copyTeachers: boolean; eligibleTeacherIds?: ReadonlySet<string> },
): ClonePlan {
  const eligible = options.eligibleTeacherIds ?? new Set<string>();
  const created: CloneCreated = { sections: 0, courseSections: 0, teachersAssigned: 0 };
  const skipped: CloneSkipped = {
    inactiveSections: 0,
    inactiveCourseSections: 0,
    inactiveCourses: 0,
    teachersNotActive: 0,
  };
  const sections: ClonePlanSection[] = [];

  const ordered = [...source].sort(
    (a, b) => a.gradeLevel - b.gradeLevel || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  for (const section of ordered) {
    if (!section.isActive) {
      skipped.inactiveSections += 1;
      continue;
    }
    const courseSections: ClonePlanSection['courseSections'] = [];
    const csOrdered = [...section.courseSections].sort((a, b) =>
      a.courseId < b.courseId ? -1 : a.courseId > b.courseId ? 1 : 0,
    );
    for (const cs of csOrdered) {
      if (!cs.isActive) {
        skipped.inactiveCourseSections += 1;
        continue;
      }
      if (!cs.course.isActive) {
        skipped.inactiveCourses += 1;
        continue;
      }
      let teacherId: string | null = null;
      if (options.copyTeachers && cs.teacherId !== null) {
        if (eligible.has(cs.teacherId)) {
          teacherId = cs.teacherId;
          created.teachersAssigned += 1;
        } else {
          skipped.teachersNotActive += 1;
        }
      }
      courseSections.push({ courseId: cs.courseId, teacherId });
    }
    sections.push({ gradeLevel: section.gradeLevel, code: section.code, courseSections });
    created.sections += 1;
    created.courseSections += courseSections.length;
  }
  return { sections, created, skipped };
}

/** Docentes que hay que comprobar (solo con copyTeachers): ids únicos y ordenados. */
export function teacherIdsToCheck(source: readonly CloneSourceSection[]): string[] {
  const ids = new Set<string>();
  for (const section of source) {
    if (!section.isActive) continue;
    for (const cs of section.courseSections) {
      if (cs.isActive && cs.course.isActive && cs.teacherId !== null) ids.add(cs.teacherId);
    }
  }
  return [...ids].sort();
}

export type CloneYearIssue = 'SAME_YEAR' | 'SOURCE_NOT_EARLIER';

/** 422 si origen y destino son el mismo año o el origen no es anterior al destino. */
export function cloneYearIssue(
  source: { id: string; year: number },
  target: { id: string; year: number },
): CloneYearIssue | null {
  if (source.id === target.id) return 'SAME_YEAR';
  if (source.year >= target.year) return 'SOURCE_NOT_EARLIER';
  return null;
}
