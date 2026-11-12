// Tabla de la bitácora (RF-62). Server Component: sin estado. El modo soporte (U9, RF-55/56) se
// muestra con texto, no solo con color. beforeState/afterState van en un <details> como texto.
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatInstant } from '../../_shared/lib/format';
import {
  type AuditFilters,
  type AuditLogView,
  auditHref,
  moduleLabel,
  ROLE_LABELS,
  stateText,
} from '../_lib/audit';

export function AuditTable({ items, filters }: { items: AuditLogView[]; filters: AuditFilters }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl p-4 text-sm ring-1 ring-foreground/10">
        No hay registros con estos filtros.
      </p>
    );
  }
  return (
    // Contenedor con scroll horizontal enfocable para teclado (ux 5g, hallazgo 10; WCAG 2.1.1).
    <div
      role="region"
      aria-label="Registros de la bitácora (se desplaza en horizontal)"
      tabIndex={0}
      className="overflow-x-auto rounded-xl ring-1 ring-foreground/10 focus-visible:outline-3 focus-visible:outline-foreground"
    >
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">
          Registros de la bitácora, del más reciente al más antiguo
        </caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="p-3 font-medium">
              Fecha (Lima)
            </th>
            <th scope="col" className="p-3 font-medium">
              Quién
            </th>
            <th scope="col" className="p-3 font-medium">
              Qué
            </th>
            <th scope="col" className="p-3 font-medium">
              Detalle
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const before = stateText(row.beforeState);
            const after = stateText(row.afterState);
            return (
              <tr key={row.id} className="border-t align-top">
                <td className="p-3 whitespace-nowrap">
                  <time dateTime={row.occurredAt}>{formatInstant(row.occurredAt)}</time>
                </td>
                <td className="p-3">
                  {row.actor ? (
                    <div className="flex flex-col gap-1">
                      <span className="font-medium break-words">{row.actor.fullName}</span>
                      <span className="text-muted-foreground">{ROLE_LABELS[row.actor.role]}</span>
                      {filters.actorId !== row.actor.id ? (
                        <Link
                          href={auditHref(filters, { actorId: row.actor.id, page: 1 })}
                          className="inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-0"
                          aria-label={`Ver solo sus acciones (${row.actor.fullName})`}
                        >
                          Ver solo sus acciones
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Sistema</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <code className="font-mono text-xs break-all">{row.action}</code>
                    <span className="text-muted-foreground">{moduleLabel(row.module)}</span>
                    {row.supportMode ? (
                      <Badge
                        variant="outline"
                        className="h-6 w-fit border-amber-700 px-2.5 text-xs text-amber-900 dark:border-amber-400 dark:text-amber-100"
                      >
                        Modo soporte
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="p-3">
                  {row.entityType ? (
                    <p className="break-all text-muted-foreground">
                      {row.entityType}
                      {row.entityId ? ` · ${row.entityId}` : ''}
                    </p>
                  ) : null}
                  {before || after ? (
                    <details className="mt-1">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-4 md:min-h-0">
                        Ver cambios
                      </summary>
                      {before ? (
                        <>
                          <p className="mt-2 font-medium">Antes</p>
                          <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                            {before}
                          </pre>
                        </>
                      ) : null}
                      {after ? (
                        <>
                          <p className="mt-2 font-medium">Después</p>
                          <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
                            {after}
                          </pre>
                        </>
                      ) : null}
                    </details>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
