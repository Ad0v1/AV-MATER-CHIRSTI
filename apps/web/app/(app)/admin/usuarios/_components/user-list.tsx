// Lista de usuarios (presentación pura): tarjetas bajo `sm` y tabla desde `sm` (360 px).
// La usan la lista del servidor (filtros de la URL) y los resultados de la búsqueda (cliente).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { StatusBadge } from '../../_shared/components/page-bits';
import { TOUCH } from '../../_shared/components/styles';
import { sectionLabel } from '../../estructura/_lib/format';
import type { UserListItem } from '../_lib/types';
import {
  CREDENTIAL_SHORT,
  CREDENTIAL_TONES,
  ROLE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  USERS_PATH,
  pageCount,
} from '../_lib/users';

const detailHref = (id: string) => `${USERS_PATH}/${encodeURIComponent(id)}`;

const sectionText = (u: UserListItem) =>
  u.role !== 'STUDENT'
    ? '—'
    : u.currentSection
      ? sectionLabel(u.currentSection.gradeLevel, u.currentSection.code, u.currentSection.level)
      : 'Sin matrícula vigente';

export function UserResults({ items, caption }: { items: UserListItem[]; caption: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay usuarios que coincidan.</p>;
  }
  return (
    <>
      {/* Móvil (< sm): tarjetas */}
      <ul className="flex flex-col gap-3 sm:hidden" aria-label={caption}>
        {items.map((u) => (
          <li key={u.id} className="flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold break-words">{u.fullName}</span>
              <StatusBadge tone={STATUS_TONES[u.status]}>{STATUS_LABELS[u.status]}</StatusBadge>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              Código: {u.code ?? 'sin código'}
            </p>
            <p className="text-sm">
              {ROLE_LABELS[u.role]}
              {u.role === 'STUDENT' ? ` · ${sectionText(u)}` : ''}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone={CREDENTIAL_TONES[u.credentialStatus]}>
                {CREDENTIAL_SHORT[u.credentialStatus]}
              </StatusBadge>
              {u.locked ? <StatusBadge tone="closed">Bloqueada</StatusBadge> : null}
              <span className="text-muted-foreground">
                Correo {u.emailVerified ? 'verificado' : 'sin verificar'}
              </span>
            </p>
            <Link
              href={detailHref(u.id)}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                TOUCH,
                'inline-flex w-full items-center',
              )}
            >
              Ver usuario<span className="sr-only">: {u.fullName}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* sm y más: tabla */}
      <div className="hidden sm:block">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nombre</TableHead>
              <TableHead scope="col">Código</TableHead>
              <TableHead scope="col">Rol</TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col">Contraseña</TableHead>
              <TableHead scope="col">Correo</TableHead>
              <TableHead scope="col">Sección</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium whitespace-normal">
                  <Link
                    href={detailHref(u.id)}
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    {u.fullName}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {u.code ?? '—'}
                </TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONES[u.status]}>{STATUS_LABELS[u.status]}</StatusBadge>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <span className="flex flex-wrap items-center gap-1">
                    <StatusBadge tone={CREDENTIAL_TONES[u.credentialStatus]}>
                      {CREDENTIAL_SHORT[u.credentialStatus]}
                    </StatusBadge>
                    {u.locked ? <StatusBadge tone="closed">Bloqueada</StatusBadge> : null}
                  </span>
                </TableCell>
                <TableCell>{u.emailVerified ? 'Verificado' : 'Sin verificar'}</TableCell>
                <TableCell className="whitespace-normal">{sectionText(u)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/**
 * Navegación entre páginas. `renderControl` pinta el enlace (lista del servidor) o el botón
 * (búsqueda en el cliente) de "Anterior" y "Siguiente".
 */
export function PageNav({
  page,
  pageSize,
  total,
  renderControl,
}: {
  page: number;
  pageSize: number;
  total: number;
  renderControl: (target: number, label: string, rel: 'prev' | 'next') => ReactNode;
}) {
  const pages = pageCount(total, pageSize);
  if (pages <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-2">
      <div>{page > 1 ? renderControl(page - 1, 'Anterior', 'prev') : null}</div>
      <p className="text-sm text-muted-foreground">
        Página {page} de {pages}
      </p>
      <div>{page < pages ? renderControl(page + 1, 'Siguiente', 'next') : null}</div>
    </nav>
  );
}

export const pageControlClass = cn(
  buttonVariants({ variant: 'outline' }),
  TOUCH,
  'inline-flex items-center',
);
