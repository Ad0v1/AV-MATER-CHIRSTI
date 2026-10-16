/**
 * Constantes del módulo de almacenamiento (Dev 3).
 * Requerimientos: RNF-03 (archivos privados), RNF-18 (almacenamiento S3), RF-28, RF-35, RN-08.
 */

export const STORAGE_CLIENT = Symbol('STORAGE_CLIENT');
export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

/**
 * PENDIENTE (docs/08_DECISIONES.md): la ERS no distingue MB de MiB.
 * Se usa MiB (1 048 576 bytes), igual que el ejemplo de docs/03_CONTRATOS.md.
 * Si el equipo decide MB decimal, basta con cambiar esta constante.
 */
export const BYTES_PER_MB = 1024 * 1024;

/** Límite por defecto de una tarea (RF-28, RN-08). */
export const DEFAULT_MAX_SIZE_BYTES = 20 * BYTES_PER_MB;

/** Tope absoluto configurable por tarea (RF-35). Ningún docente puede superarlo. */
export const ABSOLUTE_MAX_SIZE_BYTES = 50 * BYTES_PER_MB;

export const PDF_CONTENT_TYPE = 'application/pdf';

/** Los PDF válidos empiezan con estos bytes. */
export const PDF_MAGIC_BYTES = '%PDF-';

/** Prefijos permitidos dentro del bucket. */
export const OBJECT_SCOPES = ['materials', 'assignments', 'submissions'] as const;
