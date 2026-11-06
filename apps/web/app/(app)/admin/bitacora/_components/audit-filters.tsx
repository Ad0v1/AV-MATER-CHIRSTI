'use client';

// Filtros de la bitácora (RF-62): módulo, acción y rango de días. Van en la URL (no son datos
// personales) con un formulario GET y navegación del cliente (`next/form`). El filtro por actor
// se aplica desde la tabla ("Ver solo sus acciones") y viaja como campo oculto.
import Form from 'next/form';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SelectField, SubmitButton, TextField } from '../../_shared/components/form-bits';
import { TOUCH } from '../../_shared/components/styles';
import {
  AUDIT_MAX_RANGE_DAYS,
  AUDIT_PATH,
  type AuditFilters as Filters,
  hasAuditFilters,
  MODULE_LABELS,
} from '../_lib/audit';

export function AuditFilters({
  filters,
  actorName,
  dateError,
}: {
  filters: Filters;
  actorName?: string;
  /** Rango inválido: marca Desde y Hasta con aria-invalid y el mensaje (ux 5g, hallazgo 13). */
  dateError?: string | null;
}) {
  return (
    <Form
      action={AUDIT_PATH}
      aria-label="Filtros de la bitácora"
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      {filters.actorId ? <input type="hidden" name="actorId" value={filters.actorId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          name="module"
          label="Módulo"
          defaultValue={filters.module ?? ''}
          options={[
            { value: '', label: 'Todos los módulos' },
            ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <TextField
          name="action"
          label="Acción exacta"
          defaultValue={filters.action ?? ''}
          placeholder="p. ej. job.download"
          hint="Minúsculas, tal como aparece en la tabla."
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
        />
        <TextField
          name="from"
          type="date"
          label="Desde"
          defaultValue={filters.from ?? ''}
          hint="Hora de Perú (Lima)."
          error={dateError ? 'Revisa el rango de fechas.' : undefined}
        />
        <TextField
          name="to"
          type="date"
          label="Hasta"
          defaultValue={filters.to ?? ''}
          hint={`Máximo ${AUDIT_MAX_RANGE_DAYS} días.`}
          error={dateError ?? undefined}
        />
      </div>
      {filters.actorId ? (
        <p className="text-sm">
          Solo acciones de <strong>{actorName ?? 'un usuario'}</strong>.{' '}
          <Link
            href={AUDIT_PATH}
            className="underline underline-offset-4"
            aria-label="Quitar el filtro por usuario y los demás filtros"
          >
            Quitar
          </Link>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Aplicando…">Aplicar filtros</SubmitButton>
        {hasAuditFilters(filters) ? (
          <Link
            href={AUDIT_PATH}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              TOUCH,
              'inline-flex items-center',
            )}
          >
            Quitar filtros
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
