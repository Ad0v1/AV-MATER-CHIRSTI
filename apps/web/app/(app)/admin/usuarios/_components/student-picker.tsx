'use client';

// Buscador de estudiantes para vincularlos a un apoderado (RF-19, RF-25). Va DENTRO del
// formulario del apoderado: no es un <form> propio (no se anidan formularios). La búsqueda es una
// Server Action llamada con `startTransition` (el texto no va en la URL) y el campo de búsqueda
// no tiene `name`, así que no se envía con el formulario. Los elegidos viajan como `studentIds`.
import { startTransition, useActionState, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { StatusBadge } from '../../_shared/components/page-bits';
import { CONTROL, TOUCH } from '../../_shared/components/styles';
import { searchStudentsAction } from '../_lib/actions';
import type { StudentChoice, StudentSearchState } from '../_lib/types';
import {
  SEARCH_MAX,
  STATUS_LABELS,
  STATUS_TONES,
  addToSelection,
  removeFromSelection,
} from '../_lib/users';

const IDLE_SEARCH: StudentSearchState = { status: 'idle' };

/** Resumen de la búsqueda (se ve y se anuncia en la región de estado). */
function resultText(state: StudentSearchState): string {
  const shown = state.choices?.length ?? 0;
  if (shown === 0) return 'No se encontraron estudiantes.';
  if (state.total !== undefined && state.total > shown) {
    return `Se muestran ${shown} de ${state.total}. Escribe más para afinar la búsqueda.`;
  }
  return `${shown} ${shown === 1 ? 'estudiante encontrado' : 'estudiantes encontrados'}.`;
}

export function StudentPicker({
  legend,
  max,
  selected,
  onChange,
  error,
  name = 'studentIds',
}: {
  legend: string;
  max: number;
  selected: StudentChoice[];
  onChange: (next: StudentChoice[]) => void;
  /** Error del servidor para este grupo (p. ej. "Elige al menos un estudiante."). */
  error?: string;
  name?: string;
}) {
  const [state, dispatch, pending] = useActionState(searchStudentsAction, IDLE_SEARCH);
  const [q, setQ] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const announce = useAnnounce();
  const id = useId();
  const hintId = `${id}-hint`;
  const searchErrorId = `${id}-search-error`;
  const groupErrorId = `${id}-error`;
  const selectedIds = new Set(selected.map((s) => s.id));
  const groupError = localError ?? error;

  useEffect(() => {
    if (state.status === 'ok' && state.choices) announce(resultText(state));
    else if (state.status === 'error' && state.message) announce(state.message);
    else if (state.status === 'error' && state.fieldError) inputRef.current?.focus();
  }, [state, announce]);

  const search = () => {
    setLocalError(null);
    const fd = new FormData();
    fd.set('q', q);
    startTransition(() => dispatch(fd));
  };

  const add = (candidate: StudentChoice) => {
    const next = addToSelection(selected, candidate, max);
    setLocalError(next.error);
    if (next.error) {
      // Tope de estudiantes, repetido o retirado: se anuncia y el foco queda en el buscador
      // (MEDIO de UX, INFORME 13); el texto también se ve como error del grupo.
      announce(next.error);
      inputRef.current?.focus();
      return;
    }
    onChange(next.selected);
    announce(`${candidate.fullName} agregado. ${next.selected.length} de ${max} elegidos.`);
    // El botón "Agregar" se cambia por "Elegido": el foco vuelve al buscador.
    inputRef.current?.focus();
  };

  const remove = (student: StudentChoice) => {
    const next = removeFromSelection(selected, student.id);
    setLocalError(null);
    onChange(next);
    announce(`${student.fullName} quitado. ${next.length} de ${max} elegidos.`);
    // El botón "Quitar" desaparece: el foco vuelve al buscador.
    inputRef.current?.focus();
  };

  return (
    <fieldset
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
      aria-describedby={groupError ? `${hintId} ${groupErrorId}` : hintId}
    >
      <legend className="px-1 text-base font-semibold">{legend}</legend>
      <p id={hintId} className="text-sm text-muted-foreground">
        {max === 1 ? 'Busca y elige un estudiante.' : `Busca y elige de 1 a ${max} estudiantes.`} No
        se pueden elegir estudiantes retirados.
      </p>

      {/* Elegidos (viajan con el formulario) */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Elegidos: {selected.length} de {max}
        </h3>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no elegiste ninguno.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selected.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-2 ring-1 ring-foreground/10"
              >
                <input type="hidden" name={name} value={s.id} />
                <span className="min-w-0 break-words">
                  {s.fullName}
                  {s.sectionLabel ? (
                    <span className="text-muted-foreground"> · {s.sectionLabel}</span>
                  ) : null}
                </span>
                <Button type="button" variant="outline" className={TOUCH} onClick={() => remove(s)}>
                  Quitar<span className="sr-only">: {s.fullName}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groupError ? (
        <p id={groupErrorId} className="text-sm text-destructive">
          {groupError}
        </p>
      ) : null}

      {/* Buscador (sin name: no se envía con el formulario) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-q`}>Buscar estudiante por nombre o correo</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id={`${id}-q`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter busca; no envía el formulario del apoderado.
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
            maxLength={SEARCH_MAX}
            autoComplete="off"
            spellCheck={false}
            // El error del grupo ("Elige al menos un estudiante", tope) se marca en el buscador,
            // que es donde se corrige: así useFocusOnError lo encuentra por aria-invalid y el
            // lector lee el error al recibir el foco (MEDIO de UX, INFORME 13).
            aria-invalid={state.fieldError || groupError ? true : undefined}
            aria-describedby={
              [state.fieldError ? searchErrorId : '', groupError ? groupErrorId : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            className={cn(CONTROL, 'sm:max-w-sm')}
          />
          <Button
            type="button"
            variant="secondary"
            className={TOUCH}
            onClick={search}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
        {state.fieldError ? (
          <p id={searchErrorId} className="text-sm text-destructive">
            {state.fieldError}
          </p>
        ) : null}
        {state.status === 'error' && state.message ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}
      </div>

      {max > 1 && selected.length >= max ? (
        <p className="text-sm text-muted-foreground">
          Ya elegiste el máximo de {max}: quita uno para agregar otro.
        </p>
      ) : null}

      {state.status === 'ok' && state.choices ? (
        <div className="flex flex-col gap-2" aria-busy={pending || undefined}>
          <p className="text-sm text-muted-foreground">{resultText(state)}</p>
          <ul className="flex flex-col gap-2" aria-label="Estudiantes encontrados">
            {state.choices.map((c) => {
              const chosen = selectedIds.has(c.id);
              const withdrawn = c.status === 'WITHDRAWN';
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-2 ring-1 ring-foreground/10"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="break-words">{c.fullName}</span>
                    <span className="text-sm break-all text-muted-foreground">
                      {c.code ? `Código ${c.code}` : 'Sin código'}
                      {c.sectionLabel ? ` · ${c.sectionLabel}` : ' · Sin matrícula vigente'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status !== 'ACTIVE' ? (
                      <StatusBadge tone={STATUS_TONES[c.status]}>
                        {STATUS_LABELS[c.status]}
                      </StatusBadge>
                    ) : null}
                    {chosen ? (
                      <span className="text-sm text-muted-foreground">Elegido</span>
                    ) : withdrawn ? null : (
                      <Button
                        type="button"
                        variant="outline"
                        className={TOUCH}
                        onClick={() => add(c)}
                      >
                        Agregar<span className="sr-only">: {c.fullName}</span>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </fieldset>
  );
}
