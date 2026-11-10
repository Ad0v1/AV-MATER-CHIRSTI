import { describe, expect, it, vi } from 'vitest';

// B1: navegacion por curso. Sin DOM: se inspecciona el arbol de elementos React.
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/server', () => ({ apiServer: { get } }));
vi.mock('next/navigation', () => ({ usePathname: () => null }));
vi.mock('@/components/ui/sidebar', () => ({
  SidebarMenu: 'ul',
  SidebarMenuItem: 'li',
  SidebarMenuButton: 'sidebar-button',
  SidebarGroup: 'div',
  SidebarGroupContent: 'div',
  SidebarGroupLabel: 'h2',
}));

import {
  courseTabsFor,
  isCourseActive,
  myCourseItems,
  type MyCourseSection,
} from './course-nav-model';
import { CourseTabsView } from './course-tabs';
import { EMPTY_TEXT, EMPTY_TEXT_TEACHER, ERROR_TEXT, MyCoursesListView } from './my-courses-list';
import { loadMyCourses } from './my-courses-nav';

type El = { type: unknown; props: Record<string, unknown> };
function find(node: unknown, pred: (e: El) => boolean): El[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, pred));
  if (node === null || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as El;
  return [
    ...(pred(el) ? [el] : []),
    ...find(el.props.children, pred),
    ...find(el.props.render, pred),
  ];
}
const text = (tree: unknown) =>
  find(tree, (e) => typeof e.props.children === 'string').map((e) => e.props.children);

const cs = (
  id: string,
  course: string,
  courseId: string,
  grade: number,
  code: string,
): MyCourseSection => ({
  id,
  course: { id: courseId, name: course },
  section: { id: `s${grade}${code}`, gradeLevel: grade, code },
});

describe('pestañas del curso por rol', () => {
  it('TEACHER y ADMIN: 5 pestañas con Registro', () => {
    for (const r of ['TEACHER', 'ADMIN'] as const) {
      expect(courseTabsFor(r, 'x').map((t) => t.label)).toEqual([
        'Clases',
        'Lecturas',
        'Tareas',
        'Anuncios',
        'Registro',
      ]);
    }
  });
  it('STUDENT sin Registro; GUARDIAN sin barra', () => {
    expect(courseTabsFor('STUDENT', 'x').map((t) => t.key)).not.toContain('registro');
    expect(
      CourseTabsView({ role: 'GUARDIAN', courseSectionId: 'x', pathname: '/curso/x/clases' }),
    ).toBeNull();
  });
  it('nav etiquetado y aria-current solo en la activa (también en subrutas)', () => {
    const tree = CourseTabsView({
      role: 'TEACHER',
      courseSectionId: 'c1',
      pathname: '/curso/c1/registro/tarea/9',
    });
    expect(find(tree, (e) => e.type === 'nav')[0].props['aria-label']).toBe('Secciones del curso');
    const current = find(tree, (e) => e.props['aria-current'] === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].props.href).toBe('/curso/c1/registro');
  });
});

describe('Mis cursos', () => {
  const items = [
    cs('b', 'Matemática', 'm', 3, 'B'),
    cs('a', 'Arte', 'ar', 3, 'A'),
    cs('c', 'Matemática', 'm', 3, 'A'),
  ];
  it('TEACHER: curso · sección ordenado', () => {
    expect(myCourseItems('TEACHER', items).map((i) => i.label)).toEqual([
      'Arte · 3.° Secundaria A',
      'Matemática · 3.° Secundaria A',
      'Matemática · 3.° Secundaria B',
    ]);
  });
  it('STUDENT: un item por curso', () => {
    expect(myCourseItems('STUDENT', items).map((i) => i.label)).toEqual(['Arte', 'Matemática']);
  });
  it('activo en /curso/:id y subrutas', () => {
    expect(isCourseActive('/curso/a/tareas', 'a')).toBe(true);
    expect(isCourseActive('/curso/ab', 'a')).toBe(false);
    const tree = MyCoursesListView({
      items: myCourseItems('TEACHER', items),
      error: false,
      pathname: '/curso/c/lecturas',
    });
    const cur = find(tree, (e) => e.props['aria-current'] === 'page');
    expect(cur).toHaveLength(1);
    expect(cur[0].props).toMatchObject({
      href: '/curso/c/clases',
      title: 'Matemática · 3.° Secundaria A',
    });
  });
  it('lista vacía y error', () => {
    expect(text(MyCoursesListView({ items: [], error: false, pathname: null }))).toEqual([
      EMPTY_TEXT,
    ]);
    expect(text(MyCoursesListView({ items: [], error: true, pathname: null }))).toEqual([
      ERROR_TEXT,
    ]);
    const err = MyCoursesListView({ items: [], error: true, pathname: null });
    expect(find(err, (e) => e.props.role === 'alert')).toHaveLength(1);
    expect(
      text(MyCoursesListView({ items: [], error: false, pathname: null, role: 'TEACHER' })),
    ).toEqual([EMPTY_TEXT_TEACHER]);
    expect(EMPTY_TEXT_TEACHER).toContain('Consulta con el administrador');
    expect(ERROR_TEXT).toBe('No se pudieron cargar tus cursos. Recarga la página.');
  });
  it('ADMIN y GUARDIAN no piden nada; error de API no lanza', async () => {
    get.mockReset();
    expect(await loadMyCourses('ADMIN')).toBeNull();
    expect(await loadMyCourses('GUARDIAN')).toBeNull();
    expect(get).not.toHaveBeenCalled();
    get.mockRejectedValueOnce(new Error('x'));
    expect(await loadMyCourses('STUDENT')).toEqual({ items: [], error: true });
    get.mockResolvedValueOnce({ items: [cs('a', 'Arte', 'ar', 1, 'A')], total: 1 });
    expect((await loadMyCourses('TEACHER'))?.items[0].label).toBe('Arte · 1.° Secundaria A');
    expect(get).toHaveBeenCalledWith('/me/course-sections');
  });
});
