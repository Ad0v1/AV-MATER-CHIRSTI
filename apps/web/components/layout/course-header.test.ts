import { beforeEach, describe, expect, it, vi } from 'vitest';

// B1 (RF-08): encabezado del curso (layout) y redireccion de /curso/:id. Sin DOM.
const get = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
vi.mock('@/lib/api/server', () => ({ apiServer: { get } }));
vi.mock('@/lib/session', () => ({ requireUser }));
vi.mock('next/navigation', () => ({ usePathname: () => null, redirect, notFound }));

import CourseLayout from '@/app/(app)/curso/[id]/layout';
import Page from '@/app/(app)/curso/[id]/page';
import { ApiError } from '@/lib/api/errors';
import { courseTabsFor, sectionLabel } from './course-nav-model';
import { CourseTabs } from './course-tabs';

type El = { type: unknown; props: Record<string, unknown> };
function find(node: unknown, pred: (e: El) => boolean): El[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, pred));
  if (node === null || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as El;
  return [...(pred(el) ? [el] : []), ...find(el.props.children, pred)];
}
const flat = (tree: unknown) =>
  find(tree, () => true)
    .map((e) => e.props.children)
    .flat(5)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join('');

const ctx = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  readOnly: false,
  academicYear: { year: 2026 },
  section: { gradeLevel: 3, code: 'A' },
  course: { name: 'Matemática' },
  teacher: { fullName: 'Ana Pérez' },
  ...over,
});

// El layout devuelve <Suspense><CourseHeader/></Suspense>{children}: se ejecuta CourseHeader.
async function renderHeader(role: string) {
  requireUser.mockResolvedValue({ role });
  const layout = CourseLayout({ children: null, params: Promise.resolve({ id: 'c1' }) });
  const header = find(layout, (e) => typeof e.type === 'function')[0];
  return (header.type as (p: unknown) => Promise<unknown>)(header.props);
}

beforeEach(() => {
  get.mockReset();
  requireUser.mockReset();
  redirect.mockClear();
});

describe('RF-08: pestañas por rol, orden y etiquetas', () => {
  it('TEACHER y ADMIN: 5 pestañas en orden con rutas del curso', () => {
    for (const r of ['TEACHER', 'ADMIN'] as const) {
      const tabs = courseTabsFor(r, 'c1');
      expect(tabs.map((t) => t.label)).toEqual([
        'Clases',
        'Lecturas',
        'Tareas',
        'Anuncios',
        'Registro',
      ]);
      expect(tabs.map((t) => t.href)).toEqual([
        '/curso/c1/clases',
        '/curso/c1/lecturas',
        '/curso/c1/tareas',
        '/curso/c1/anuncios',
        '/curso/c1/registro',
      ]);
    }
  });
  it('STUDENT: 4 pestañas sin Registro; GUARDIAN: ninguna', () => {
    expect(courseTabsFor('STUDENT', 'c1').map((t) => t.label)).toEqual([
      'Clases',
      'Lecturas',
      'Tareas',
      'Anuncios',
    ]);
    expect(courseTabsFor('GUARDIAN', 'c1')).toEqual([]);
  });
  it('sectionLabel formatea grado y código', () => {
    expect(sectionLabel({ gradeLevel: 5, code: 'B' })).toBe('5°B');
  });
});

describe('RF-08: encabezado del curso (layout)', () => {
  it('con contexto: curso, sección, docente y año; sin aviso de solo lectura', async () => {
    get.mockResolvedValueOnce(ctx());
    const tree = await renderHeader('TEACHER');
    expect(get).toHaveBeenCalledWith('/course-sections/c1/context');
    const t = flat(tree);
    expect(t).toContain('Matemática');
    expect(t).toContain('Docente: Ana Pérez');
    expect(t).toContain('2026');
    expect(find(tree, (e) => e.props.role === 'status')).toHaveLength(0);
    const tabs = find(tree, (e) => e.type === CourseTabs)[0];
    expect(tabs.props).toMatchObject({ role: 'TEACHER', courseSectionId: 'c1' });
  });
  it('readOnly: muestra aviso con role=status', async () => {
    get.mockResolvedValueOnce(ctx({ readOnly: true }));
    const tree = await renderHeader('TEACHER');
    const status = find(tree, (e) => e.props.role === 'status');
    expect(status).toHaveLength(1);
    expect(status[0].props.children).toContain('solo lectura');
  });
  it('sin docente asignado', async () => {
    get.mockResolvedValueOnce(ctx({ teacher: null }));
    expect(flat(await renderHeader('ADMIN'))).toContain('Sin docente asignado');
  });
  it.each([403, 404])('/context responde %i: notFound()', async (status) => {
    get.mockRejectedValueOnce(new ApiError(status, 'X', 'x'));
    await expect(renderHeader('STUDENT')).rejects.toThrow('NEXT_NOT_FOUND');
  });
  it('otro error de /context: aviso role=alert y las pestañas siguen', async () => {
    get.mockRejectedValueOnce(new ApiError(500, 'X', 'x'));
    const tree = await renderHeader('STUDENT');
    expect(flat(tree)).toContain('No se pudieron cargar los datos del curso. Recarga la página');
    expect(find(tree, (e) => e.props.role === 'alert')).toHaveLength(1);
    expect(find(tree, (e) => e.props.role === 'status')).toHaveLength(0);
    expect(find(tree, (e) => e.type === CourseTabs)).toHaveLength(1);
  });
});

describe('RF-08: /curso/:id', () => {
  it('redirige a Clases', async () => {
    await expect(Page({ params: Promise.resolve({ id: 'c9' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/curso/c9/clases',
    );
    expect(redirect).toHaveBeenCalledWith('/curso/c9/clases');
  });
  it('codifica el id en la redireccion', async () => {
    await expect(Page({ params: Promise.resolve({ id: 'a/../b' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/curso/a%2F..%2Fb/clases',
    );
  });
});
