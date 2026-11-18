// /admin/estructura/cursos — catálogo de cursos (RF-14).
import { Suspense } from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/app/(app)/admin/_shared/components/empty-state';
import { ROUTE_META } from '@/lib/route-meta';
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
import type { CourseView, List } from '../_lib/types';

export const metadata = { title: 'Catálogo de cursos' };

export default function Page() {
  return (
    <PageShell>
      <PageHeader
        title={ROUTE_META['/admin/estructura/cursos'].title}
        description={ROUTE_META['/admin/estructura/cursos'].description}
        crumbs={ROUTE_META['/admin/estructura/cursos'].crumbs}
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
        <EmptyState icon={BookOpen} title="Aún no hay cursos">
          Crea el primero con el formulario de arriba. Después podrás asignarlo a las secciones de
          cada año.
        </EmptyState>
      ) : (
        <ul className="mt-1 flex flex-col">
          {items.map((c) => (
            <li key={c.id} className="border-b border-line/60 py-4 first:pt-1 last:border-b-0">
              <CourseItem
                course={c}
                badge={
                  <StatusBadge tone={c.isActive ? 'active' : 'inactive'}>
                    {c.isActive ? 'Activo' : 'Inactivo'}
                  </StatusBadge>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
