// Lista de usuarios (presentación pura): tarjetas bajo `sm` y tabla desde `sm` (360 px).
// La usan la lista del servidor (filtros de la URL) y los resultados de la búsqueda (cliente).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, SearchX } from 'lucide-react';
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
import { EmptyState } from '../../_shared/components/empty-state';
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
    return (
      <EmptyState icon={SearchX} title="No hay usuarios que coincidan">
        Prueba con otros filtros o quita alguno para ampliar la lista.
      </EmptyState>
    );
  }
  return (
    <>
      {/* Móvil (< sm): tarjetas */}
      <ul className="flex flex-col sm:hidden" aria-label={caption}>
        {items.map((u) => (
          <li
            key={u.id}
            className="flex flex-col gap-2 border-b border-line/60 py-4 first:pt-0 last:border-b-0"
          >
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
                buttonVariants({ variant: 'ghost' }),
                TOUCH,
                '-ml-3 w-fit gap-1.5 px-3 text-brand hover:bg-brand-soft',
              )}
            >
              Ver usuario<span className="sr-only">: {u.fullName}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
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
                <TableCell className="py-2 whitespace-normal">
                  <Link
                    href={detailHref(u.id)}
                    className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
                  >
                    {u.fullName}
                  </Link>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {u.code ?? 'Sin código'}
                  </span>
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
                <TableCell className={u.emailVerified ? '' : 'text-muted-foreground'}>
                  {u.emailVerified ? 'Verificado' : 'Sin verificar'}
                </TableCell>
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
  buttonVariants({ variant: 'ghost' }),
  TOUCH,
  'inline-flex items-center px-3 text-brand hover:bg-brand-soft md:min-h-9',
);
