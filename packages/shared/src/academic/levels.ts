// Catálogo de niveles educativos (tres niveles, decisión del usuario 09/11/2026).
// gradeLevel es el grado dentro del nivel: INICIAL 3..5 (años de edad), PRIMARIA 1..6, SECUNDARIA 1..5.
// Debe coincidir con el CHECK Section_gradeLevel_chk de la migración 20261109120000_tres_niveles.

export const EDUCATION_LEVELS = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const LEVEL_GRADES: Readonly<Record<EducationLevel, { min: number; max: number }>> = {
  INICIAL: { min: 3, max: 5 },
  PRIMARIA: { min: 1, max: 6 },
  SECUNDARIA: { min: 1, max: 5 },
};

export const LEVEL_LABELS: Readonly<Record<EducationLevel, string>> = {
  INICIAL: 'Inicial',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
};

export function isEducationLevel(value: unknown): value is EducationLevel {
  return typeof value === 'string' && (EDUCATION_LEVELS as readonly string[]).includes(value);
}

/** Verdadero si el grado es un entero dentro del rango del nivel. */
export function isValidGradeForLevel(level: EducationLevel, gradeLevel: number): boolean {
  const range = LEVEL_GRADES[level];
  return Number.isInteger(gradeLevel) && gradeLevel >= range.min && gradeLevel <= range.max;
}

/** Grados válidos del nivel, en orden. */
export function gradesForLevel(level: EducationLevel): number[] {
  const { min, max } = LEVEL_GRADES[level];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

/** Etiqueta legible: "5 años", "3.° Primaria", "2.° Secundaria". */
export function gradeLabel(level: EducationLevel, gradeLevel: number): string {
  if (level === 'INICIAL') return `${gradeLevel} años`;
  return `${gradeLevel}.° ${LEVEL_LABELS[level]}`;
}

/** Etiqueta de sección: "3.° Primaria A", "5 años B". */
export function sectionLabel(level: EducationLevel, gradeLevel: number, code: string): string {
  return `${gradeLabel(level, gradeLevel)} ${code}`;
}

/** Siguiente grado al promover, o null si egresa (SECUNDARIA 5.°). */
export function nextGrade(
  level: EducationLevel,
  gradeLevel: number,
): { level: EducationLevel; gradeLevel: number } | null {
  if (gradeLevel < LEVEL_GRADES[level].max) return { level, gradeLevel: gradeLevel + 1 };
  if (level === 'INICIAL') return { level: 'PRIMARIA', gradeLevel: LEVEL_GRADES.PRIMARIA.min };
  if (level === 'PRIMARIA') return { level: 'SECUNDARIA', gradeLevel: LEVEL_GRADES.SECUNDARIA.min };
  return null;
}

// Escala de calificación por nivel (no se guarda en la BD; decisión 1 del usuario 09/11/2026).
export const GRADING_SCALES = ['LITERAL_ADABC', 'NUMERIC_0_20'] as const;
export type GradingScale = (typeof GRADING_SCALES)[number];

export function scaleForLevel(level: EducationLevel): GradingScale {
  return level === 'SECUNDARIA' ? 'NUMERIC_0_20' : 'LITERAL_ADABC';
}
