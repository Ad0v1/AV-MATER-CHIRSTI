// /admin/anuncios — anuncios de la institución o de un grado (RF-32, Dev 5). Solo ADMIN (el layout
// de admin lo exige y la API lo vuelve a validar). Muestra los del año activo.
import { Suspense } from 'react';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { ROUTES } from '@/lib/routes';
import { AnnouncementForm } from '../../anuncios/_components/announcement-form';
import { AnnouncementList } from '../../anuncios/_components/announcement-list';
import { parsePage, type AnnouncementPage } from '../../anuncios/_lib/announcements';

export const metadata = { title: 'Anuncios' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Anuncios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comunicados para toda la institución o para un grado. Se avisa a los estudiantes y a sus
          apoderados.
        </p>
      </div>
      <section aria-labelledby="new-announcement" className="rounded-lg border p-4">
        <h2 id="new-announcement" className="mb-3 text-base font-semibold">
          Nuevo anuncio
        </h2>
        <AnnouncementForm mode={{ kind: 'admin' }} />
      </section>
      <section aria-labelledby="published" className="flex flex-col gap-3">
        <h2 id="published" className="text-base font-semibold">
          Publicados en el año activo
        </h2>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando anuncios…</p>}>
          <List searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

async function List({ searchParams }: { searchParams: Search }) {
  const page = parsePage((await searchParams).page);
  let data: AnnouncementPage;
  try {
    data = await apiServer.get<AnnouncementPage>(`/announcements?page=${page}`);
  } catch (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {toUserMessage(error)}
      </p>
    );
  }
  return (
    <AnnouncementList
      page={data}
      emptyText="Todavía no hay anuncios institucionales en el año activo."
      hrefForPage={(n) => (n > 1 ? `${ROUTES.adminAnuncios}?page=${n}` : ROUTES.adminAnuncios)}
    />
  );
}
