'use client';

// Búsqueda por nombre o correo (RF-22) con Server Action (POST). Decisión de seguridad 3 de la
// entrega 5a: el texto buscado son nombres o correos de menores, así que no va en la URL (ni en
// el historial del navegador ni en los registros de acceso). Los resultados viven solo en el
// estado del cliente; mientras hay una búsqueda, reemplazan a la lista del servidor (`children`).
// Al aplicar otros filtros la página monta un buscador nuevo (`key={searchResetKey(filters)}` en
// page.tsx): los resultados de la búsqueda anterior se descartan y vuelve la lista filtrada.
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAnnounce } from '../../_shared/components/action-feedback';
import { SubmitButton } from '../../_shared/components/form-bits';
import { CONTROL, TOUCH } from '../../_shared/components/styles';
import { FOCUS_HEADING } from '../../_shared/lib/focus';
import { searchUsersAction } from '../_lib/actions';
import type { SearchState } from '../_lib/types';
import { CLEAR_SEARCH_INTENT, SEARCH_MAX, rangeText, type UserFilters } from '../_lib/users';
import { PageNav, UserResults } from './user-list';

const IDLE_SEARCH: SearchState = { status: 'idle' };

/** Filtros actuales como campos del formulario de búsqueda (la búsqueda los respeta). */
function filterEntries(filters: UserFilters): [string, string][] {
  const entries: [string, string][] = [];
  if (filters.role) entries.push(['role', filters.role]);
  if (filters.status) entries.push(['status', filters.status]);
  if (filters.gradeLevel !== undefined) entries.push(['gradeLevel', String(filters.gradeLevel)]);
  if (filters.sectionId) entries.push(['sectionId', filters.sectionId]);
  return entries;
}

export function UserSearch({ filters, children }: { filters: UserFilters; children: ReactNode }) {
  const [state, dispatch, pending] = useActionState(searchUsersAction, IDLE_SEARCH);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  const announce = useAnnounce();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const entries = filterEntries(filters);

  useEffect(() => {
    if (state.status === 'ok' && state.result) {
      const { total } = state.result;
      announce(
        total === 0
          ? 'La búsqueda no encontró usuarios.'
          : `La búsqueda encontró ${total} ${total === 1 ? 'usuario' : 'usuarios'}.`,
      );
      if (focusResults.current) resultsRef.current?.focus();
    } else if (state.status === 'error' && state.fieldError) {
      inputRef.current?.focus();
    } else if (state.status === 'error' && state.message) {
      announce(state.message);
    }
    focusResults.current = false;
  }, [state, announce]);

  const dispatchWith = (values: [string, string][]) => {
    const fd = new FormData();
    for (const [k, v] of values) fd.append(k, v);
    startTransition(() => dispatch(fd));
  };

  const goTo = (page: number) => {
    if (!state.q) return;
    focusResults.current = true;
    dispatchWith([['q', state.q], ...entries, ['page', String(page)]]);
  };

  const clear = () => {
    setQ('');
    dispatchWith([['intent', CLEAR_SEARCH_INTENT]]);
    // La lista del servidor vuelve a verse: se avisa (BAJO de UX, INFORME 13).
    announce('Volviste a la lista de usuarios.');
    inputRef.current?.focus();
  };

  const showing = state.status === 'ok' && state.result ? state.result : null;

  return (
    <>
      <form
        role="search"
        aria-label="Buscar usuarios"
        action={dispatch}
        noValidate
        className="flex flex-col gap-2"
      >
        {entries.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="page" value="1" />
        <Label htmlFor={id}>Buscar por nombre o correo</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id={id}
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={SEARCH_MAX}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={state.fieldError ? true : undefined}
            aria-describedby={state.fieldError ? `${hintId} ${errorId}` : hintId}
            className={cn(CONTROL, 'sm:max-w-md')}
          />
          <SubmitButton pendingText="Buscando…">Buscar</SubmitButton>
          {showing || state.status === 'error' ? (
            <Button type="button" variant="outline" className={TOUCH} onClick={clear}>
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
        <p id={hintId} className="text-sm text-muted-foreground">
          De 2 a {SEARCH_MAX} caracteres. Respeta los filtros aplicados. Lo que escribes no se
          guarda en la dirección de la página.
        </p>
        {state.fieldError ? (
          <p id={errorId} className="text-sm text-destructive">
            {state.fieldError}
          </p>
        ) : null}
      </form>

      {state.status === 'error' && state.message ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo buscar</AlertTitle>
          <AlertDescription>
            <p className="break-words">{state.message}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {showing ? (
        <section aria-labelledby={`${id}-resultados`} aria-busy={pending || undefined}>
          <div className="mb-3 flex flex-col gap-1">
            <h2
              id={`${id}-resultados`}
              ref={resultsRef}
              tabIndex={-1}
              className={cn('text-lg font-semibold', FOCUS_HEADING)}
            >
              Resultados de la búsqueda
            </h2>
            <p className="text-sm text-muted-foreground">
              {rangeText(showing.page, showing.pageSize, showing.total, showing.items.length)}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <UserResults items={showing.items} caption="Resultados de la búsqueda de usuarios" />
            <PageNav
              page={showing.page}
              pageSize={showing.pageSize}
              total={showing.total}
              renderControl={(target, label) => (
                <Button
                  type="button"
                  variant="outline"
                  className={TOUCH}
                  disabled={pending}
                  onClick={() => goTo(target)}
                >
                  {label}
                </Button>
              )}
            />
          </div>
        </section>
      ) : (
        children
      )}
    </>
  );
}
