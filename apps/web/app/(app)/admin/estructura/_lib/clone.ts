// Clonar la estructura de un año en otro (RF-15, F6 entrega 6a). Lógica pura, probada en
// clone.test.ts. La API decide (docs/03): aquí solo se arma la pantalla y se valida la forma.
import type { YearSummary } from './types';
import { isUuid } from './validation';

export type CloneCreated = { sections: number; courseSections: number; teachersAssigned: number };

export type CloneSkipped = {
  inactiveSections: number;
  inactiveCourseSections: number;
  inactiveCourses: number;
  teachersNotActive: number;
};

/** Respuesta 201 de POST /academic-years/:id/clone-structure. */
export type CloneStructureResult = {
  targetYear: YearSummary;
  sourceYearId: string;
  created: CloneCreated;
  skipped: CloneSkipped;
};

/** Año que puede ser origen: anterior al destino, con su número de secciones activas. */
export type SourceCandidate = { id: string; year: number; activeSections: number };

/** Máximo de años anteriores que se consultan como posibles orígenes. */
export const MAX_SOURCE_CANDIDATES = 10;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Motivo por el que no se puede clonar en el año, o null si se puede: año cerrado o de solo
 * lectura (D-030), o año que ya tiene secciones (el clon solo va a un año vacío).
 */
export function cloneBlockReason(
  target: Pick<YearSummary, 'closedAt' | 'readOnly'>,
  sectionTotal: number,
): string | null {
  if (target.closedAt) return 'El año está cerrado: no se le puede copiar estructura.';
  if (target.readOnly) {
    return 'El año es de solo lectura (anterior al año activo): no se le puede copiar estructura.';
  }
  if (sectionTotal > 0) {
    return `El año ya tiene ${plural(sectionTotal, 'sección', 'secciones')}: solo se copia la estructura a un año sin secciones.`;
  }
  return null;
}

/** true si se muestra el enlace "Copiar estructura" en la ficha del año. */
export const canOfferClone = (
  target: Pick<YearSummary, 'closedAt' | 'readOnly'>,
  sectionTotal: number,
): boolean => cloneBlockReason(target, sectionTotal) === null;

/** Años anteriores al destino, del más reciente al más antiguo (como mucho MAX_SOURCE_CANDIDATES). */
export function previousYears<T extends Pick<YearSummary, 'id' | 'year'>>(
  years: readonly T[],
  target: Pick<YearSummary, 'id' | 'year'>,
): T[] {
  return years
    .filter((y) => y.id !== target.id && y.year < target.year)
    .sort((a, b) => b.year - a.year)
    .slice(0, MAX_SOURCE_CANDIDATES);
}

export type SourceOptions = {
  /** Opciones del selector: solo años con al menos una sección activa. */
  options: { value: string; label: string }[];
  /** Años anteriores sin secciones activas (se nombran en una nota, no se pueden elegir). */
  empty: number[];
  /** Opción elegida al abrir: el año anterior más reciente con secciones activas. */
  defaultId: string | null;
};

export function sourceOptions(candidates: readonly SourceCandidate[]): SourceOptions {
  const sorted = [...candidates].sort((a, b) => b.year - a.year);
  const usable = sorted.filter((c) => c.activeSections > 0);
  return {
    options: usable.map((c) => ({
      value: c.id,
      label: `${c.year} (${plural(c.activeSections, 'sección activa', 'secciones activas')})`,
    })),
    empty: sorted.filter((c) => c.activeSections === 0).map((c) => c.year),
    defaultId: usable[0]?.id ?? null,
  };
}

export type CloneFormInput =
  { ok: true; sourceYearId: string; copyTeachers: boolean } | { ok: false; error: string };

/**
 * Datos del formulario: el origen debe ser uno de los ofrecidos y "copiar docentes" solo vale
 * 'on' (casilla marcada) o ausente.
 */
export function parseCloneForm(
  sourceYearId: string,
  copyTeachersRaw: string | null,
  allowedIds?: readonly string[],
): CloneFormInput {
  if (!isUuid(sourceYearId) || (allowedIds && !allowedIds.includes(sourceYearId))) {
    return { ok: false, error: 'Elige el año del que se copia la estructura.' };
  }
  if (copyTeachersRaw !== null && copyTeachersRaw !== 'on') {
    return { ok: false, error: 'La opción de copiar docentes no es válida.' };
  }
  return { ok: true, sourceYearId, copyTeachers: copyTeachersRaw === 'on' };
}

/** Líneas del resultado: lo creado y, si hubo, lo que no se copió. */
export function cloneResultLines(result: Pick<CloneStructureResult, 'created' | 'skipped'>): {
  created: string[];
  skipped: string[];
} {
  const { created, skipped } = result;
  const createdLines = [
    plural(created.sections, 'sección creada', 'secciones creadas'),
    plural(created.courseSections, 'curso asignado a secciones', 'cursos asignados a secciones'),
    created.teachersAssigned > 0
      ? plural(created.teachersAssigned, 'curso con docente copiado', 'cursos con docente copiado')
      : 'Los cursos quedaron sin docente: asígnalos en cada sección.',
  ];
  const skippedLines: string[] = [];
  if (skipped.inactiveSections > 0) {
    skippedLines.push(plural(skipped.inactiveSections, 'sección inactiva', 'secciones inactivas'));
  }
  if (skipped.inactiveCourseSections > 0) {
    skippedLines.push(
      plural(
        skipped.inactiveCourseSections,
        'curso inactivo en su sección',
        'cursos inactivos en su sección',
      ),
    );
  }
  if (skipped.inactiveCourses > 0) {
    skippedLines.push(
      plural(
        skipped.inactiveCourses,
        'curso desactivado del catálogo',
        'cursos desactivados del catálogo',
      ),
    );
  }
  if (skipped.teachersNotActive > 0) {
    skippedLines.push(
      plural(
        skipped.teachersNotActive,
        'docente que ya no está activo (el curso quedó sin docente)',
        'docentes que ya no están activos (los cursos quedaron sin docente)',
      ),
    );
  }
  return { created: createdLines, skipped: skippedLines };
}

/** Mensaje que se anuncia al terminar (corto: el detalle queda en pantalla). */
export function cloneSuccessMessage(result: Pick<CloneStructureResult, 'created'>): string {
  const { sections, courseSections } = result.created;
  return `Estructura copiada: ${plural(sections, 'sección', 'secciones')} y ${plural(courseSections, 'curso', 'cursos')}.`;
}
