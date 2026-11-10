import type { CSSProperties } from 'react';

export type CursoColor =
  | 'terracota'
  | 'azul'
  | 'bosque'
  | 'ciruela'
  | 'ocre'
  | 'turquesa'
  | 'vino'
  | 'oliva'
  | 'indigo'
  | 'cacao';

/** Expone --course y --course-soft del color elegido (variables definidas en maqueta.css). */
export function cursoStyle(color: CursoColor): CSSProperties {
  return {
    '--course': `var(--course-${color})`,
    '--course-soft': `var(--course-${color}-soft)`,
  } as CSSProperties;
}
