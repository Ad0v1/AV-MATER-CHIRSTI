// B1 (Dev 1, RF-08): logica pura de la navegacion por curso (sidebar "Mis cursos" y pestañas del
// curso). Sin React ni `server-only` para poder probarla con Vitest.
import { COURSE_ROUTES } from '@/lib/routes';
import type { Role } from '@/lib/roles';

/** Forma de cada item de GET /me/course-sections (docs/03). */
export type MyCourseSection = {
  id: string;
  course: { id: string; name: string };
  section: { id: string; level?: EducationLevel; gradeLevel: number; code: string };
  academicYear?: { id: string; year: number };
  teacher?: { id: string; fullName: string } | null;
  enrollmentId?: string;
};

export type NavLinkItem = { key: string; href: string; label: string };

/** Solo docente y estudiante tienen "Mis cursos" (ADMIN y GUARDIAN reciben 403 en la API). */
export function hasMyCourses(role: Role): boolean {
  return role === 'TEACHER' || role === 'STUDENT';
}

/** Tres niveles (09/11/2026). Sin `level` se asume SECUNDARIA (datos previos a la migración). */
export type EducationLevel = 'INICIAL' | 'PRIMARIA' | 'SECUNDARIA';

const LEVEL_LABELS: Record<EducationLevel, string> = {
  INICIAL: 'Inicial',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
};
const LEVEL_ORDER: Record<EducationLevel, number> = { INICIAL: 0, PRIMARIA: 1, SECUNDARIA: 2 };

/** "3.° Secundaria A", "4.° Primaria C", "5 años C". */
export function sectionLabel(s: {
  level?: EducationLevel;
  gradeLevel: number;
  code: string;
}): string {
  const level = s.level ?? 'SECUNDARIA';
  if (level === 'INICIAL') return `${s.gradeLevel} años ${s.code}`;
  return `${s.gradeLevel}.° ${LEVEL_LABELS[level]} ${s.code}`;
}

/** TEACHER: "Curso · 3.° Secundaria A" por curso-sección. STUDENT: un item por curso. Orden curso y sección. */
export function myCourseItems(role: Role, items: MyCourseSection[]): NavLinkItem[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.course.name.localeCompare(b.course.name, 'es') ||
      LEVEL_ORDER[a.section.level ?? 'SECUNDARIA'] - LEVEL_ORDER[b.section.level ?? 'SECUNDARIA'] ||
      a.section.gradeLevel - b.section.gradeLevel ||
      a.section.code.localeCompare(b.section.code, 'es'),
  );
  const out: NavLinkItem[] = [];
  const seenCourses = new Set<string>();
  for (const it of sorted) {
    if (role === 'STUDENT') {
      if (seenCourses.has(it.course.id)) continue;
      seenCourses.add(it.course.id);
    }
    out.push({
      key: it.id,
      href: COURSE_ROUTES.clases(it.id),
      label:
        role === 'TEACHER' ? `${it.course.name} · ${sectionLabel(it.section)}` : it.course.name,
    });
  }
  return out;
}

/** Un curso del sidebar esta activo en /curso/:id y en cualquier subruta /curso/:id/*. */
export function isCourseActive(pathname: string | null, courseSectionId: string): boolean {
  if (!pathname) return false;
  const base = `/curso/${courseSectionId}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Una pestaña esta activa en su ruta y en sus subrutas (p. ej. /registro/tarea/:id). */
export function isTabActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pestañas por rol. TEACHER y ADMIN: todas; STUDENT: sin Registro; GUARDIAN: ninguna. */
export function courseTabsFor(role: Role, id: string): NavLinkItem[] {
  if (role === 'GUARDIAN') return [];
  const tabs: NavLinkItem[] = [
    { key: 'clases', href: COURSE_ROUTES.clases(id), label: 'Clases' },
    { key: 'lecturas', href: COURSE_ROUTES.lecturas(id), label: 'Lecturas' },
    { key: 'tareas', href: COURSE_ROUTES.tareas(id), label: 'Tareas' },
    { key: 'anuncios', href: COURSE_ROUTES.anuncios(id), label: 'Anuncios' },
  ];
  if (role === 'TEACHER' || role === 'ADMIN') {
    tabs.push({ key: 'registro', href: COURSE_ROUTES.registro(id), label: 'Registro' });
  }
  return tabs;
}
