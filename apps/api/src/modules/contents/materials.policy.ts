// Reglas puras de los materiales (RF-26, RF-27, RF-30), sin BD. Probadas en materials.policy.spec.ts.

export type MaterialKindValue = 'CLASS' | 'READING';

export const MATERIAL_TITLE_MAX = 200;
export const MATERIAL_DESCRIPTION_MAX = 5_000;

/** RF-30: días que un material permanece en la papelera y se puede restaurar. */
export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * RF-27 / RNF-12: aviso de copyright que acompaña a toda lectura. Texto fijo del sistema
 * (no lo escribe el docente) para que siempre se muestre igual. Pendiente de validación legal
 * por la institución (docs/05, "Legal").
 */
export const READING_COPYRIGHT_NOTICE =
  'Este material se comparte solo con fines educativos para los estudiantes del curso. ' +
  'Sus derechos pertenecen a sus autores y editores: no lo copies, publiques ni distribuyas ' +
  'fuera del aula virtual.';

/** Aviso de copyright de un material: el texto fijo para READING; null para CLASS. */
export const copyrightNoticeFor = (kind: MaterialKindValue): string | null =>
  kind === 'READING' ? READING_COPYRIGHT_NOTICE : null;

/** Fecha hasta la que se puede restaurar un material borrado (deletedAt + 30 días). */
export const trashExpiresAt = (deletedAt: Date): Date =>
  new Date(deletedAt.getTime() + TRASH_DAYS * DAY_MS);

/** RF-30: se restaura si no pasaron más de 30 días desde el borrado (el día 30 incluido). */
export const canRestore = (deletedAt: Date, now: Date): boolean =>
  now.getTime() <= trashExpiresAt(deletedAt).getTime();

export type MaterialFields = {
  title: string;
  description: string | null;
  isReusable: boolean;
};

const FIELD_ORDER: ReadonlyArray<keyof MaterialFields> = ['title', 'description', 'isReusable'];
/** Textos libres: nunca van a la bitácora ni a los eventos. */
const FREE_TEXT = new Set<keyof MaterialFields>(['title', 'description']);

export type MaterialChange = {
  changedFields: Array<keyof MaterialFields>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/** Compara el material con la edición pedida (undefined no cuenta; null sí borra la descripción). */
export function diffMaterial(
  current: MaterialFields,
  patch: Partial<MaterialFields>,
): MaterialChange {
  const change: MaterialChange = { changedFields: [], before: {}, after: {} };
  for (const key of FIELD_ORDER) {
    const next = patch[key];
    if (next === undefined || Object.is(current[key], next)) continue;
    change.changedFields.push(key);
    if (FREE_TEXT.has(key)) continue;
    change.before[key] = current[key];
    change.after[key] = next;
  }
  return change;
}
