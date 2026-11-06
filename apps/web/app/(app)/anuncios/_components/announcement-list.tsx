// Lista paginada de anuncios (RF-32), compartida por las pantallas de anuncios. Server Component:
// el cuerpo se muestra como texto (React lo escapa), nunca como HTML.
import Link from 'next/link';
import {
  formatPublished,
  pageCount,
  scopeLabel,
  type AnnouncementPage,
} from '../_lib/announcements';
import { AnnouncementActions } from './announcement-actions';
import { ListStatus } from './list-status';

export function AnnouncementList({
  page,
  emptyText,
  hrefForPage,
  showStudents = false,
}: {
  page: AnnouncementPage;
  emptyText: string;
  hrefForPage: (n: number) => string;
  /** Apoderado: a cuál de sus estudiantes alcanza cada anuncio. */
  showStudents?: boolean;
}) {
  if (page.items.length === 0) {
    return (
      <>
        <ListStatus />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </>
    );
  }
  const pages = pageCount(page);
  return (
    <>
      <ListStatus />
      <ul className="grid gap-3">
        {page.items.map((a) => (
          <li key={a.id}>
            <article className="rounded-lg border p-4" aria-labelledby={`an-${a.id}`}>
              <h3
                id={`an-${a.id}`}
                tabIndex={-1}
                className="rounded-sm text-base font-semibold break-words outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {a.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {scopeLabel(a)} ·{' '}
                <time dateTime={a.publishedAt}>{formatPublished(a.publishedAt)}</time>
                {a.edited ? ' · Editado' : ''}
              </p>
              {showStudents && a.students && a.students.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Para: {a.students.map((s) => s.fullName).join(', ')}
                </p>
              ) : null}
              <p className="mt-2 text-sm whitespace-pre-line break-words">{a.body}</p>
              {a.canEdit ? <AnnouncementActions id={a.id} title={a.title} body={a.body} /> : null}
            </article>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label="Páginas de anuncios" className="mt-4 flex items-center gap-3 text-sm">
          {page.page > 1 ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border px-4"
              href={hrefForPage(page.page - 1)}
            >
              Anterior
            </Link>
          ) : null}
          <span>
            Página {page.page} de {pages}
          </span>
          {page.page < pages ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border px-4"
              href={hrefForPage(page.page + 1)}
            >
              Siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
