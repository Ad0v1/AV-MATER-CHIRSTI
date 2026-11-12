export type CourseArea =
  | 'matematica'
  | 'comunicacion'
  | 'ciencia'
  | 'personal-social'
  | 'arte'
  | 'educacion-fisica'
  | 'ingles'
  | 'religion';

/** Area del curso a partir de su nombre (guia 2.8.4). `null` = sin imagen, fondo de color. */
export function courseArea(courseName: string): CourseArea | null {
  const n = courseName.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/educacion fisica|psicomotri/.test(n)) return 'educacion-fisica';
  if (/matemat/.test(n)) return 'matematica';
  if (/comunicaci|lenguaje|literatura/.test(n)) return 'comunicacion';
  if (/ciencia|tecnolog|biolog|quimic|fisica/.test(n)) return 'ciencia';
  if (/personal social|desarrollo personal|ciudadan|civica|historia|geograf|economia/.test(n)) {
    return 'personal-social';
  }
  if (/arte|musica|dibujo/.test(n)) return 'arte';
  if (/ingles|english/.test(n)) return 'ingles';
  if (/religi/.test(n)) return 'religion';
  return null;
}

/** Ruta de la imagen del area del curso, o `null` si el curso no tiene area. */
export function imagenCurso(courseName: string): string | null {
  const area = courseArea(courseName);
  return area ? `/maqueta/img/curso-${area}.webp` : null;
}
