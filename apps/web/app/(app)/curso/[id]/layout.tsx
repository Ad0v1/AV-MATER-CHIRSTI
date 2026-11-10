// B1 (Dev 1, RF-08): encabezado comun del curso-sección y barra de secciones. Datos de
// GET /course-sections/:id/context (docs/03). La API valida la pertenencia; si falla se muestra
// un aviso y la pagina hija sigue mostrando su propio estado.
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { CourseTabs } from '@/components/layout/course-tabs';
import { sectionLabel, type EducationLevel } from '@/components/layout/course-nav-model';
import { ApiError } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { requireUser } from '@/lib/session';

type Context = {
  id: string;
  readOnly: boolean;
  academicYear: { year: number };
  section: { level?: EducationLevel; gradeLevel: number; code: string };
  course: { name: string };
  teacher: { fullName: string } | null;
};

type Params = Promise<{ id: string }>;

export default function CourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <CourseHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function CourseHeader({ params }: { params: Params }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  let ctx: Context | null = null;
  try {
    ctx = await apiServer.get<Context>(`/course-sections/${encodeURIComponent(id)}/context`);
  } catch (err) {
    // Sin pertenencia o inexistente: 404 (no se revela si el curso existe). Otros errores: aviso.
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) notFound();
    ctx = null;
  }
  return (
    <div className="flex min-w-0 flex-col">
      <div className="min-w-0 px-4 pt-4 md:px-8">
        {ctx ? (
          <>
            <p
              className="truncate text-lg font-semibold"
              title={`${ctx.course.name} · ${sectionLabel(ctx.section)}`}
            >
              {ctx.course.name} · {sectionLabel(ctx.section)}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {ctx.teacher ? `Docente: ${ctx.teacher.fullName}` : 'Sin docente asignado'} · Año{' '}
              {ctx.academicYear.year}
            </p>
            {ctx.readOnly ? (
              <p className="mt-2 rounded-md border px-3 py-2 text-sm" role="status">
                Este curso está en solo lectura: no se pueden publicar ni modificar contenidos.
              </p>
            ) : null}
          </>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            No se pudieron cargar los datos del curso. Recarga la página o vuelve a intentarlo en
            unos minutos.
          </p>
        )}
      </div>
      <div className="mt-2">
        <CourseTabs role={user.role} courseSectionId={id} />
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  // Misma estructura que CourseHeader para no mover la pagina al cargar.
  return (
    <div className="flex min-w-0 flex-col" aria-busy="true">
      <div className="min-w-0 px-4 pt-4 md:px-8">
        <span className="flex h-7 items-center" aria-hidden="true">
          <span className="block h-5 w-48 max-w-full animate-pulse rounded bg-muted" />
        </span>
        <span className="flex h-5 items-center" aria-hidden="true">
          <span className="block h-4 w-64 max-w-full animate-pulse rounded bg-muted" />
        </span>
      </div>
      <div className="mt-2 h-11 border-b" aria-hidden="true" />
      <span className="sr-only">Cargando datos del curso…</span>
    </div>
  );
}
