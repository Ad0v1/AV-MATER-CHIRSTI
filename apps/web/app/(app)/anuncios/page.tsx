// /anuncios — anuncios que alcanzan al usuario (RF-32, Dev 5). La API (GET /me/announcements)
// decide qué ve cada rol; el apoderado puede filtrar por uno de sus estudiantes vinculados.
import { Suspense } from 'react';
import Link from 'next/link';
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { ROUTES } from '@/lib/routes';
import { requireRole } from '@/lib/session';
import { AnnouncementList } from './_components/announcement-list';
import { isUuid, parsePage, type AnnouncementPage } from './_lib/announcements';

export const metadata = { title: 'Anuncios' };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Ward = { studentId: string; fullName: string };

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Anuncios</h1>
      <p className="text-sm text-muted-foreground">
        Comunicados de la institución, del grado y de los cursos.
      </p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando anuncios…</p>}>
        <Content searchParams={searchParams} />
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

async function Content({ searchParams }: { searchParams: Search }) {
  const [user, sp] = await Promise.all([
    requireRole('STUDENT', 'TEACHER', 'GUARDIAN'),
    searchParams,
  ]);
  const page = parsePage(sp.page);
  const studentId = user.role === 'GUARDIAN' && isUuid(sp.studentId) ? sp.studentId : undefined;

  let students: Ward[] = [];
  if (user.role === 'GUARDIAN') {
    try {
      students = (await apiServer.get<{ items: Ward[] }>('/guardian/students')).items;
    } catch (error) {
      return <ErrorText>{toUserMessage(error)}</ErrorText>;
    }
    if (students.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No tienes estudiantes vinculados. Comunícate con la institución.
        </p>
      );
    }
  }

  const href = (n: number, sid = studentId) => {
    const qs = new URLSearchParams();
    if (sid) qs.set('studentId', sid);
    if (n > 1) qs.set('page', String(n));
    const s = qs.toString();
    return s ? `${ROUTES.anuncios}?${s}` : ROUTES.anuncios;
  };

  let data: AnnouncementPage;
  try {
    const qs = new URLSearchParams({ page: String(page) });
    if (studentId) qs.set('studentId', studentId);
    data = await apiServer.get<AnnouncementPage>(`/me/announcements?${qs.toString()}`);
  } catch (error) {
    return <ErrorText>{toUserMessage(error)}</ErrorText>;
  }

  const filters: { key: string; label: string; sid: string | undefined }[] = [
    { key: 'all', label: 'Todos', sid: undefined },
    ...students.map((s) => ({ key: s.studentId, label: s.fullName, sid: s.studentId })),
  ];

  return (
    <>
      {students.length > 1 ? (
        <nav aria-label="Filtrar por estudiante" className="flex flex-wrap gap-2 text-sm">
          {filters.map((f) => {
            const current = f.sid === studentId;
            return (
              <Link
                key={f.key}
                href={href(1, f.sid)}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-md border px-4 ${current ? 'bg-primary text-primary-foreground' : ''}`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <h2 className="sr-only">Lista de anuncios</h2>
      <AnnouncementList
        page={data}
        emptyText="No hay anuncios por ahora."
        hrefForPage={(n) => href(n)}
        showStudents={user.role === 'GUARDIAN' && !studentId && students.length > 1}
      />
    </>
  );
}
