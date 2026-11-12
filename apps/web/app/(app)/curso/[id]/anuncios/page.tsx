// /curso/:id/anuncios — anuncios del curso-sección (RF-32, Dev 5). Docente asignado o ADMIN
// publican, editan y retiran; la API valida la asignación. El estudiante y el apoderado ven los
// anuncios de sus cursos en /anuncios.
import { Suspense } from 'react';
import Link from 'next/link';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';
import { requireUser } from '@/lib/session';
import { AnnouncementForm } from '../../../anuncios/_components/announcement-form';
import { AnnouncementList } from '../../../anuncios/_components/announcement-list';
import { isUuid, parsePage, type AnnouncementPage } from '../../../anuncios/_lib/announcements';

export const metadata = { title: 'Anuncios del curso' };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Anuncios del curso</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se avisa a los estudiantes de la sección y a sus apoderados.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando anuncios…</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

async function Content({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return (
      <p className="text-sm">
        Los anuncios de tus cursos están en{' '}
        <Link className="underline underline-offset-4" href={ROUTES.anuncios}>
          Anuncios
        </Link>
        .
      </p>
    );
  }
  if (!isUuid(id)) return <ErrorText>El curso no existe o ya no está disponible.</ErrorText>;
  const page = parsePage(sp.page);
  let data: AnnouncementPage;
  try {
    data = await apiServer.get<AnnouncementPage>(
      `/course-sections/${id}/announcements?page=${page}`,
    );
  } catch (error) {
    return <ErrorText>{toUserMessage(error)}</ErrorText>;
  }
  const base = COURSE_ROUTES.anuncios(id);
  return (
    <>
      <section aria-labelledby="new-course-announcement" className="rounded-lg border p-4">
        <h2 id="new-course-announcement" className="mb-3 text-base font-semibold">
          Nuevo anuncio
        </h2>
        <AnnouncementForm mode={{ kind: 'course', courseSectionId: id }} />
      </section>
      <section aria-labelledby="course-published" className="flex flex-col gap-3">
        <h2 id="course-published" className="text-base font-semibold">
          Publicados
        </h2>
        <AnnouncementList
          page={data}
          emptyText="Todavía no hay anuncios en este curso."
          hrefForPage={(n) => (n > 1 ? `${base}?page=${n}` : base)}
        />
      </section>
    </>
  );
}
