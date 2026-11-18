'use client';

// Lista de usuarios con pestañas por rol, filtros, búsqueda en vivo y paginación (RF-22).
//
// Velocidad: nada de esto navega al servidor. Pestañas, filtros, búsqueda y páginas cambian un
// estado local y los datos salen de una caché en memoria:
//  - Lo ya visto se muestra al instante (y, si es viejo, se actualiza en segundo plano).
//  - Lo que falta se pide con una Server Action (`loadUsersAction`); mientras llega se sigue
//    mostrando lo anterior, atenuado, en vez de un esqueleto.
//  - Las otras pestañas y la página siguiente se precargan, así cambiar de pestaña no espera.
//  - La URL se actualiza sin recargar (`history.replaceState`) para poder compartir o recargar.
//
// Privacidad (decisión de seguridad 3 de la entrega 5a): el texto buscado son nombres o correos de
// menores. Va solo en el cuerpo del POST de la Server Action; nunca en la URL ni en el historial.
import Link from 'next/link';
import {
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { CircleAlert, Loader2, Search, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CONTROL, SOFT_FIELDS, TOUCH } from '../../_shared/components/styles';
import { loadUsersAction } from '../_lib/actions';
import type { SectionOption, UserListPage, UserRole } from '../_lib/types';
import {
  SEARCH_MAX,
  SEARCH_MIN,
  buildUserListQuery,
  listHref,
  pageCount,
  parseUserFilters,
  rangeText,
  type UserFilters as Filters,
} from '../_lib/users';
import { NO_FILTERS, UserFilters, type FilterValues } from './user-filters';
import { PageNav, UserResults } from './user-list';

/** Espera tras dejar de escribir antes de buscar. */
const DEBOUNCE_MS = 300;
/** Lo guardado en la caché se muestra siempre; pasado este tiempo se actualiza por detrás. */
const STALE_MS = 8_000;
const MAX_CACHE = 120;

const TABS: UserRole[] = ['STUDENT', 'TEACHER', 'GUARDIAN', 'ADMIN'];
const TAB_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiantes',
  TEACHER: 'Docentes',
  GUARDIAN: 'Apoderados',
  ADMIN: 'Administradores',
};

const SEARCH_HINT = `Busca por nombre, correo, código de usuario o DNI (los 8 dígitos). De ${SEARCH_MIN} a ${SEARCH_MAX} caracteres. Respeta el tipo de usuario y los filtros aplicados. Lo que escribes no se guarda en la dirección de la página.`;

// --- Caché en memoria (vive mientras la pantalla está abierta) ----------------------------

type Entry = { data: UserListPage; at: number };
const cache = new Map<string, Entry>();
const inflight = new Set<string>();

function remember(key: string, data: UserListPage) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now() });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as string);
}

// --- Estado de la pantalla ---------------------------------------------------------------

type Query = FilterValues & { role: UserRole; page: number };

const filtersOf = (q: Query): Filters =>
  parseUserFilters({
    role: q.role,
    status: q.status || undefined,
    credentials: q.credentials || undefined,
    emailVerified: q.emailVerified || undefined,
    level: q.level || undefined,
    gradeLevel: q.gradeLevel || undefined,
    sectionId: q.sectionId || undefined,
    page: String(q.page),
  });

const keyOf = (filters: Filters, term: string) => buildUserListQuery(filters, { q: term });

const rawOf = (filters: Filters, term: string) => ({
  role: filters.role,
  status: filters.status,
  credentials: filters.credentials,
  emailVerified: filters.emailVerified,
  level: filters.level,
  gradeLevel: filters.gradeLevel === undefined ? undefined : String(filters.gradeLevel),
  sectionId: filters.sectionId,
  page: String(filters.page),
  q: term,
});

const queryFromFilters = (f: Filters): Query => ({
  role: f.role ?? 'STUDENT',
  status: f.status ?? '',
  credentials: f.credentials ?? '',
  emailVerified: f.emailVerified ?? '',
  level: f.level ?? '',
  gradeLevel: f.gradeLevel === undefined ? '' : String(f.gradeLevel),
  sectionId: f.sectionId ?? '',
  page: f.page,
});

export function UsersExplorer({
  initialFilters,
  initial,
  sections,
}: {
  initialFilters: Filters;
  /** Primera página (la pide el servidor); null si falló: entonces se pide desde aquí. */
  initial: Promise<UserListPage | null>;
  sections: Promise<SectionOption[]>;
}) {
  const first = use(initial);
  const [query, setQuery] = useState<Query>(() => queryFromFilters(initialFilters));
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  // Sube cuando la caché recibe algo: vuelve a pintar y relee la caché.
  const [version, setVersion] = useState(0);
  const [fetching, setFetching] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [shown, setShown] = useState<UserListPage | null>(() => {
    // Cada visita a la pantalla empieza con datos frescos del servidor.
    cache.clear();
    inflight.clear();
    if (first) remember(keyOf(initialFilters, ''), first);
    return first;
  });

  const id = useId();
  const hintId = `${id}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => filtersOf(query), [query]);
  const key = keyOf(filters, term);
  const entry = cache.get(key);

  // Se muestra lo de la caché apenas existe; mientras llega lo nuevo, queda lo anterior.
  if (entry && entry.data !== shown) setShown(entry.data);

  const load = useCallback((f: Filters, q: string, silent: boolean) => {
    const k = keyOf(f, q);
    if (inflight.has(k)) return;
    inflight.add(k);
    if (!silent) setFetching(k);
    void loadUsersAction(rawOf(f, q)).then((res) => {
      inflight.delete(k);
      if (res.ok) {
        remember(k, res.result);
        setVersion((v) => v + 1);
      } else if (!silent) {
        setError({ key: k, message: res.message });
      }
      setFetching((current) => (current === k ? null : current));
    });
  }, []);

  // Pide lo que falta (o actualiza por detrás lo que ya es viejo).
  const latest = useRef({ filters, term });
  useEffect(() => {
    latest.current = { filters, term };
  });
  useEffect(() => {
    const { filters: f, term: q } = latest.current;
    const cached = cache.get(key);
    if (!cached) load(f, q, false);
    else if (Date.now() - cached.at > STALE_MS) load(f, q, true);
  }, [key, load]);

  // Precarga: la primera página de las otras pestañas y la página siguiente de la actual.
  useEffect(() => {
    for (const role of TABS) {
      if (role !== latest.current.filters.role)
        load(filtersOf({ ...NO_FILTERS, role, page: 1 }), '', true);
    }
  }, [load]);
  useEffect(() => {
    const data = cache.get(key)?.data;
    if (!data) return;
    const { filters: f, term: q } = latest.current;
    if (f.page < pageCount(data.total, data.pageSize)) {
      const next = { ...f, page: f.page + 1 };
      if (!cache.has(keyOf(next, q))) load(next, q, true);
    }
  }, [key, version, load]);

  // La URL refleja pestaña, filtros y página (sin recargar y sin el texto buscado).
  useEffect(() => {
    window.history.replaceState(null, '', listHref(filters, filters.page));
  }, [filters]);

  // Búsqueda con debounce: se aplica sola poco después de dejar de escribir.
  useEffect(() => {
    const t = input.trim();
    const next = t.length >= SEARCH_MIN ? t : '';
    if (next === term) return;
    const timer = setTimeout(
      () => {
        setTerm(next);
        setQuery((q) => ({ ...q, page: 1 }));
      },
      next === '' ? 0 : DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [input, term]);

  const patch = (changes: Partial<Query>) => setQuery((q) => ({ ...q, page: 1, ...changes }));
  const selectRole = (role: UserRole) => {
    // Cambiar de pestaña quita los filtros (dependen del tipo de usuario) y conserva la búsqueda.
    setQuery({ ...NO_FILTERS, role, page: 1 });
  };
  const clearSearch = () => {
    setInput('');
    setTerm('');
    setQuery((q) => ({ ...q, page: 1 }));
    inputRef.current?.focus();
  };

  const showing = shown;
  const waiting = !entry; // lo que se ve no corresponde aún a lo pedido
  const currentError = error?.key === key && !entry ? error.message : null;
  const busy = fetching === key && !entry;

  return (
    <>
      <RoleTabs active={query.role} onSelect={selectRole} />

      <form
        role="search"
        aria-label="Buscar usuarios"
        onSubmit={(e) => e.preventDefault()}
        className={`flex flex-col gap-1.5 ${SOFT_FIELDS}`}
      >
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id}>Buscar por nombre, correo, código o DNI</Label>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Más información sobre la búsqueda"
                  className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-active"
                />
              }
            >
              <CircleAlert className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-sm">
              {SEARCH_HINT}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id={id}
            name="q"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={SEARCH_MAX}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            // Sin la "x" nativa del navegador: se usa la propia, en negro.
            className={cn(
              CONTROL,
              'pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
            )}
          />
          {busy ? (
            <Loader2
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : input !== '' ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-foreground hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-line-active"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {/* El mismo texto del tooltip para lectores de pantalla (no leen los tooltips de forma fiable). */}
        <span id={hintId} className="sr-only">
          {SEARCH_HINT}
        </span>
      </form>

      <UserFilters
        values={query}
        isStudent={query.role === 'STUDENT'}
        sections={sections}
        onChange={(changes) => patch(changes)}
      />

      <section
        aria-labelledby={`${id}-lista`}
        aria-busy={waiting || undefined}
        className="flex flex-col gap-2"
      >
        <h2 id={`${id}-lista`} className="sr-only">
          {term ? 'Resultados de la búsqueda' : `Lista de ${TAB_LABELS[query.role].toLowerCase()}`}
        </h2>
        {currentError ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo cargar la lista</AlertTitle>
            <AlertDescription>
              <p className="break-words">{currentError}</p>
            </AlertDescription>
          </Alert>
        ) : showing ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {rangeText(showing.page, showing.pageSize, showing.total, showing.items.length)}
            </p>
            <div className={cn('transition-opacity', waiting && 'opacity-50')}>
              <UserResults
                items={showing.items}
                caption={`${TAB_LABELS[query.role]}, por nombre`}
              />
            </div>
            <PageNav
              page={showing.page}
              pageSize={showing.pageSize}
              total={showing.total}
              renderControl={(target, label) => (
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(TOUCH, 'px-3 text-brand hover:bg-brand-soft md:min-h-9')}
                  onClick={() => setQuery((q) => ({ ...q, page: target }))}
                >
                  {label}
                </Button>
              )}
            />
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando usuarios…
          </p>
        )}
      </section>
    </>
  );
}

/** Pestañas por tipo de usuario: enlaces reales (se pueden abrir en otra pestaña) que no recargan. */
function RoleTabs({ active, onSelect }: { active: UserRole; onSelect: (role: UserRole) => void }) {
  const onClick = (event: MouseEvent, role: UserRole) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onSelect(role);
  };
  return (
    <nav aria-label="Tipo de usuario" className="-mb-2 overflow-x-auto border-b border-line">
      <ul className="flex min-w-max gap-1">
        {TABS.map((role) => {
          const current = role === active;
          return (
            <li key={role}>
              <Link
                href={listHref({ role }, 1)}
                // Sin precarga de la página: los datos de cada pestaña ya se precargan desde el estado.
                prefetch={false}
                onClick={(e) => onClick(e, role)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-active',
                  current
                    ? 'border-brand text-brand'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {TAB_LABELS[role]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
