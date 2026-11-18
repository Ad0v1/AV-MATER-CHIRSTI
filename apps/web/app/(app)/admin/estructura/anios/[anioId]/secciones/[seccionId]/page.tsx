// /admin/estructura/anios/[anioId]/secciones/[seccionId] — cursos de la sección y su docente
// (RF-17, D-029; RN-11 solo lectura).
import { RouteLoading } from '@/components/layout/route-loading';
import { Suspense } from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/app/(app)/admin/_shared/components/empty-state';
import { CourseSectionItem, AddCourseForm } from '../../../../_components/course-section-panels';
import {
  LoadError,
  PageHeader,
  PageShell,
  ReadOnlyNotice,
  Section,
  StatusBadge,
} from '@/app/(app)/admin/_shared/components/page-bits';
import {
  getYear,
  listActiveTeachers,
  listCourseSections,
  listCourses,
  listSections,
} from '../../../../_lib/data';
import { sectionLabel } from '../../../../_lib/format';
import type {
  CourseSectionView,
  CourseView,
  List,
  SectionView,
  TeacherOption,
  YearDetail,
} from '../../../../_lib/types';
import { isUuid } from '../../../../_lib/validation';
import { ApiError } from '@/lib/api/errors';

export const metadata = { title: 'Sección' };

export default function Page({
  params,
}: PageProps<'/admin/estructura/anios/[anioId]/secciones/[seccionId]'>) {
  return (
    <PageShell>
      <Suspense fallback={<RouteLoading bare />}>
        <SectionDetail params={params} />
      </Suspense>
    </PageShell>
  );
}

const ROOT = { href: '/admin/estructura', label: 'Estructura académica' };
const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message);

async function SectionDetail({
  params,
}: {
  params: Promise<{ anioId: string; seccionId: string }>;
}) {
  const { anioId, seccionId } = await params;
  if (!isUuid(anioId) || !isUuid(seccionId)) {
    return (
      <>
        <PageHeader title="Sección" crumbs={[ROOT, { label: 'Sección' }]} />
        <LoadError error={notFound('La sección no existe')} backHref="/admin/estructura" />
      </>
    );
  }

  let year: YearDetail;
  let sections: List<SectionView>;
  let courseSections: List<CourseSectionView>;
  let courses: List<CourseView>;
  let teachers: TeacherOption[];
  try {
    [year, sections, courseSections, courses, teachers] = await Promise.all([
      getYear(anioId),
      listSections(anioId),
      listCourseSections(seccionId),
      listCourses(false),
      listActiveTeachers(),
    ]);
  } catch (error) {
    return (
      <>
        <PageHeader title="Sección" crumbs={[ROOT, { label: 'Sección' }]} />
        <LoadError error={error} backHref={`/admin/estructura/anios/${anioId}`} />
      </>
    );
  }

  // No hay GET /sections/:id: la sección se busca en la lista del año (y así se comprueba que
  // pertenece a ese año).
  const section = sections.items.find((s) => s.id === seccionId);
  const yearHref = `/admin/estructura/anios/${year.id}`;
  if (!section) {
    return (
      <>
        <PageHeader
          title="Sección"
          crumbs={[ROOT, { href: yearHref, label: String(year.year) }, { label: 'Sección' }]}
        />
        <LoadError error={notFound('La sección no existe en este año')} backHref={yearHref} />
      </>
    );
  }

  const label = sectionLabel(section.gradeLevel, section.code, section.level);
  const readOnly = year.readOnly;
  const assigned = new Set(courseSections.items.map((cs) => cs.course.id));
  const available = courses.items.filter((c) => !assigned.has(c.id));
  const items = [...courseSections.items].sort((a, b) =>
    a.course.name.localeCompare(b.course.name, 'es'),
  );

  return (
    <>
      <PageHeader
        title={`Sección ${label} · ${year.year}`}
        crumbs={[ROOT, { href: yearHref, label: String(year.year) }, { label: `Sección ${label}` }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={section.isActive ? 'active' : 'inactive'}>
              {section.isActive ? 'Sección activa' : 'Sección inactiva'}
            </StatusBadge>
            <span>Cursos que se dictan en la sección y su docente.</span>
          </span>
        }
      />
      {readOnly ? (
        <ReadOnlyNotice>
          El año {year.year} es de solo lectura: no se pueden agregar cursos ni cambiar docentes.
        </ReadOnlyNotice>
      ) : null}
      {!readOnly && !section.isActive ? (
        <ReadOnlyNotice>
          La sección está inactiva: actívala en la página del año para agregarle cursos.
        </ReadOnlyNotice>
      ) : null}

      {!readOnly && section.isActive ? (
        <AddCourseForm sectionId={section.id} courses={available} teachers={teachers} />
      ) : null}

      <Section
        id="cursos-seccion"
        title="Cursos de la sección"
        description={`${courseSections.total} ${courseSections.total === 1 ? 'curso' : 'cursos'}.`}
      >
        {items.length === 0 ? (
          <EmptyState icon={BookOpen} title="La sección aún no tiene cursos">
            {readOnly || !section.isActive
              ? 'No se pueden agregar cursos en este momento.'
              : 'Agrega el primero con el formulario de arriba y asígnale un docente.'}
          </EmptyState>
        ) : (
          <ul className="mt-1 flex flex-col">
            {items.map((cs) => (
              <li key={cs.id} className="border-b border-line/60 py-4 first:pt-1 last:border-b-0">
                <CourseSectionItem
                  courseSection={cs}
                  teachers={teachers}
                  readOnly={readOnly}
                  badge={
                    <StatusBadge tone={cs.isActive ? 'active' : 'inactive'}>
                      {cs.isActive ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
