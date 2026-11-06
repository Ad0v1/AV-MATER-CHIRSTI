// /admin/estructura/cursos — catálogo de cursos (RF-14).
import { Suspense } from 'react';
import { CourseItem, CreateCourseForm } from '../_components/course-panels';
import {
  LoadError,
  LoadingBlock,
  PageHeader,
  PageShell,
  Section,
  StatusBadge,
} from '@/app/(app)/admin/_shared/components/page-bits';
import { listCourses } from '../_lib/data';
import { FOCUS_HEADING, focusIds } from '../_lib/focus';
import { cn } from '@/lib/utils';
import type { CourseView, List } from '../_lib/types';

export const metadata = { title: 'Catálogo de cursos' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title="Catálogo de cursos"
        description="Cursos que se pueden asignar a las secciones de cualquier año."
        crumbs={[{ href: '/admin/estructura', label: 'Estructura académica' }, { label: 'Cursos' }]}
      />
      <CreateCourseForm />
      <Suspense fallback={<LoadingBlock rows={5} label="Cargando cursos…" />}>
        <CourseList />
      </Suspense>
    </PageShell>
  );
}

async function CourseList() {
  let data: List<CourseView>;
  try {
    data = await listCourses(true);
  } catch (error) {
    return <LoadError error={error} />;
  }
  const items = [...data.items].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'es'),
  );
  return (
    <Section
      id="cursos"
      title="Cursos"
      description={`${data.total} ${data.total === 1 ? 'curso' : 'cursos'}, primero los activos.`}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay cursos.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id={focusIds.course(c.id)}
                  tabIndex={-1}
                  className={cn('font-semibold break-words', FOCUS_HEADING)}
                >
                  {c.name}
                </h3>
                <StatusBadge tone={c.isActive ? 'active' : 'inactive'}>
                  {c.isActive ? 'Activo' : 'Inactivo'}
                </StatusBadge>
              </div>
              <CourseItem course={c} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
