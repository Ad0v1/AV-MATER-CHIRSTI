'use client';

// Filtros de la bitácora (RF-62): módulo, acción y rango de días. Van en la URL (no son datos
// personales). El filtro por actor se aplica desde la tabla ("Ver solo sus acciones") y viaja como
// campo oculto.
//
// La acción se busca en vivo: poco después de dejar de escribir se aplica sola (debounce), con un
// spinner mientras carga y una "x" para borrar. Módulo y fechas se aplican con el botón, o junto
// con la próxima búsqueda. La navegación usa `replace` para no llenar el historial al escribir.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { CircleAlert, Loader2, Search, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SelectField, TextField } from '../../_shared/components/form-bits';
import { CONTROL, SOFT_FIELDS, TOUCH } from '../../_shared/components/styles';
import {
  ACTION_RE,
  AUDIT_MAX_RANGE_DAYS,
  AUDIT_PATH,
  type AuditFilters as Filters,
  hasAuditFilters,
  MODULE_LABELS,
} from '../_lib/audit';

/** Espera tras dejar de escribir antes de buscar. */
const DEBOUNCE_MS = 350;

const ACTION_HINT =
  'Acción exacta, en minúsculas y tal como aparece en la tabla (p. ej. job.download).';

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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const hintId = `${id}-hint`;

  const appliedAction = filters.action ?? '';
  const [action, setAction] = useState(appliedAction);
  // Si el filtro cambia desde fuera (p. ej. "Quitar filtros"), el campo se pone al día.
  const [seen, setSeen] = useState(appliedAction);
  if (seen !== appliedAction) {
    setSeen(appliedAction);
    if (appliedAction !== action.trim().toLowerCase()) setAction(appliedAction);
  }

  /** Navega con los valores actuales del formulario; `override` sustituye la acción. */
  const apply = (override?: { action: string }) => {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim() !== '') params.set(key, value.trim());
    }
    if (override) {
      if (override.action) params.set('action', override.action);
      else params.delete('action');
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${AUDIT_PATH}?${query}` : AUDIT_PATH));
  };

  // El temporizador usa siempre la versión más reciente de `apply`.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  // Búsqueda con debounce: se aplica sola si el texto es válido y distinto de lo ya aplicado.
  useEffect(() => {
    const term = action.trim().toLowerCase();
    if (term === appliedAction) return;
    if (term !== '' && (term.length > 100 || !ACTION_RE.test(term))) return;
    const timer = setTimeout(() => applyRef.current({ action: term }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [action, appliedAction]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    apply({ action: action.trim().toLowerCase() });
  };

  const clearAction = () => {
    setAction('');
    apply({ action: '' });
    document.getElementById(id)?.focus();
  };

  return (
    <form
      ref={formRef}
      action={AUDIT_PATH}
      method="get"
      onSubmit={onSubmit}
      aria-label="Filtros de la bitácora"
      className={`flex flex-col gap-4 ${SOFT_FIELDS}`}
    >
      {filters.actorId ? <input type="hidden" name="actorId" value={filters.actorId} /> : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id}>Buscar por acción</Label>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Más información sobre la búsqueda por acción"
                  className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
                />
              }
            >
              <CircleAlert className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-sm">
              {ACTION_HINT}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={id}
            name="action"
            type="search"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="p. ej. job.download"
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            // Sin la "x" nativa del navegador: se usa la propia, en negro.
            className={cn(
              CONTROL,
              'pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
            )}
          />
          {pending ? (
            <Loader2
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : action !== '' ? (
            <button
              type="button"
              onClick={clearAction}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-foreground hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-line-active"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {/* El mismo texto del tooltip para lectores de pantalla (no leen los tooltips de forma fiable). */}
        <span id={hintId} className="sr-only">
          {ACTION_HINT}
        </span>
        <span role="status" className="sr-only">
          {pending ? 'Buscando…' : ''}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          key={`m-${filters.module ?? ''}`}
          name="module"
          label="Módulo"
          defaultValue={filters.module ?? ''}
          options={[
            { value: '', label: 'Todos los módulos' },
            ...Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <TextField
          key={`f-${filters.from ?? ''}`}
          name="from"
          type="date"
          label="Desde"
          defaultValue={filters.from ?? ''}
          error={dateError ? 'Revisa el rango de fechas.' : undefined}
        />
        <TextField
          key={`t-${filters.to ?? ''}`}
          name="to"
          type="date"
          label="Hasta"
          defaultValue={filters.to ?? ''}
          error={dateError ?? undefined}
        />
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Fechas en hora de Perú (Lima). Rango máximo de {AUDIT_MAX_RANGE_DAYS} días.
      </p>

      {filters.actorId ? (
        <p className="text-sm">
          Solo acciones de <strong>{actorName ?? 'un usuario'}</strong>.{' '}
          <Link
            href={AUDIT_PATH}
            className="text-brand underline underline-offset-4"
            aria-label="Quitar el filtro por usuario y los demás filtros"
          >
            Quitar
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="submit"
          variant="ghost"
          disabled={pending}
          className="bg-brand-soft px-4 text-brand hover:bg-brand-soft/70 md:min-h-9"
        >
          {pending ? 'Aplicando…' : 'Aplicar filtros'}
        </Button>
        {hasAuditFilters(filters) ? (
          <Link
            href={AUDIT_PATH}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              TOUCH,
              'px-3 text-ink-2 hover:bg-foreground/5 hover:text-foreground md:min-h-9',
            )}
          >
            Quitar filtros
          </Link>
        ) : null}
      </div>
    </form>
  );
}
