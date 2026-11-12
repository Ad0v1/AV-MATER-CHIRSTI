'use client';

// Calendario de plazos (RF-54, U10): FullCalendar solo con daygrid y list. En pantallas angostas
// (< 640 px, p. ej. 360 px) abre en lista, que se lee mejor y es una tabla para el lector de
// pantalla. Cada plazo es un enlace (estudiante y docente) o un elemento con nombre accesible;
// el resumen de cada carga se anuncia en una región de estado. Sin instrucciones ni notas.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventMountArg, EventSourceFuncArg, EventInput } from '@fullcalendar/core';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { COURSE_ROUTES } from '@/lib/routes';
import { limaTimeZonePlugin } from './lima-time-zone-plugin';
import { LIMA_TIME_ZONE } from '../_lib/lima-time';
import type { Role } from '@/lib/roles';
import { loadCalendarAction } from '../_lib/actions';
import { summaryText, toEvents, type GuardianStudent } from '../_lib/calendar';

const NARROW = '(max-width: 639px)';

/**
 * Colores de FullCalendar con los tokens del tema (globals.css), en claro y en oscuro. Eventos:
 * --primary con --primary-foreground (contraste mayor que 4,5:1 en ambos modos; el azul por
 * defecto #3788d8 con texto blanco daba unos 3,9:1).
 */
const THEME = {
  '--fc-page-bg-color': 'var(--background)',
  '--fc-neutral-bg-color': 'var(--muted)',
  '--fc-neutral-text-color': 'var(--muted-foreground)',
  '--fc-border-color': 'var(--border)',
  '--fc-today-bg-color': 'var(--accent)',
  '--fc-list-event-hover-bg-color': 'var(--muted)',
  '--fc-event-bg-color': 'var(--primary)',
  '--fc-event-border-color': 'var(--primary)',
  '--fc-event-text-color': 'var(--primary-foreground)',
  '--fc-button-bg-color': 'var(--primary)',
  '--fc-button-border-color': 'var(--primary)',
  '--fc-button-text-color': 'var(--primary-foreground)',
  '--fc-button-hover-bg-color': 'var(--primary)',
  '--fc-button-hover-border-color': 'var(--ring)',
  '--fc-button-active-bg-color': 'var(--foreground)',
  '--fc-button-active-border-color': 'var(--ring)',
} as CSSProperties;

/** Botones de 44 px, barra que se acomoda a 360 px, foco visible (WCAG 2.4.7) y texto del tema. */
const CALENDAR_CLASSES = [
  'text-sm text-foreground',
  '[&_.fc-button]:min-h-11 [&_.fc-button]:min-w-11',
  '[&_.fc-toolbar]:flex-wrap [&_.fc-toolbar]:gap-2 [&_.fc-toolbar-title]:text-lg',
  '[&_.fc-event:focus-visible]:outline-3 [&_.fc-event:focus-visible]:outline-offset-2 [&_.fc-event:focus-visible]:outline-foreground',
  '[&_.fc-daygrid-more-link:focus-visible]:outline-3 [&_.fc-daygrid-more-link:focus-visible]:outline-offset-2 [&_.fc-daygrid-more-link:focus-visible]:outline-foreground',
  '[&_.fc-list-event-title_a:focus-visible]:outline-3 [&_.fc-list-event-title_a:focus-visible]:outline-foreground',
  '[&_.fc-button:focus-visible]:outline-3 [&_.fc-button:focus-visible]:outline-offset-2 [&_.fc-button:focus-visible]:outline-foreground',
  '[&_.fc-list-day-cushion]:text-foreground [&_.fc-list-event-time]:text-foreground [&_.fc-list-event-title_a]:text-foreground',
].join(' ');

function subscribeNarrow(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const isNarrow = (): boolean => window.matchMedia(NARROW).matches;
const ALL = '';

export function DeadlineCalendar({
  role,
  students = [],
}: {
  role: Role;
  students?: GuardianStudent[];
}) {
  // FullCalendar mide el DOM: se monta solo en el cliente (en el servidor `narrow` es null).
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => null);
  const [studentId, setStudentId] = useState(ALL);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const calendarRef = useRef<FullCalendar>(null);
  const isGuardian = role === 'GUARDIAN';

  // En pantalla angosta solo hay lista (sin botón "Mes"); al ensanchar vuelve a la vista de mes.
  useEffect(() => {
    if (narrow === null) return;
    calendarRef.current?.getApi().changeView(narrow ? 'listMonth' : 'dayGridMonth');
  }, [narrow]);

  const loadEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const result = await loadCalendarAction(info.startStr, info.endStr, studentId || null);
      if (!result.ok) {
        setError(result.message);
        setStatus('');
        return [];
      }
      setError('');
      setStatus(summaryText(result.view.items.length, result.view.truncated));
      return toEvents(result.view.items, {
        taskHref: isGuardian ? undefined : (id) => COURSE_ROUTES.tareas(id),
        showStudents: isGuardian && studentId === ALL && students.length > 1,
      });
    },
    [studentId, isGuardian, students.length],
  );

  // Vista de mes: nombre accesible completo (curso, tarea, sección, vencimiento) en cada plazo y,
  // si no es enlace (apoderado), foco con Tab. Sin `title`: repetiría el aria-label. En la vista
  // de lista el elemento es una fila de tabla con hora y título visibles: no se toca.
  const onEventMount = useCallback((arg: EventMountArg) => {
    if (arg.view.type.startsWith('list')) return;
    const label = String(arg.event.extendedProps.label ?? arg.event.title);
    if (!arg.event.url) {
      arg.el.setAttribute('role', 'note');
      arg.el.setAttribute('tabindex', '0');
    }
    arg.el.setAttribute('aria-label', label);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {isGuardian && students.length > 0 ? (
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="calendario-estudiante">Estudiante</Label>
          <NativeSelect
            id="calendario-estudiante"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full [&_select]:h-11 md:[&_select]:h-9"
          >
            <NativeSelectOption value={ALL}>Todos mis estudiantes</NativeSelectOption>
            {students.map((s) => (
              <NativeSelectOption key={s.studentId} value={s.studentId}>
                {s.fullName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Las horas están en hora de Perú (Lima). Usa los botones de arriba para cambiar de mes
        {narrow ? '.' : ' y entre la vista de mes y la de lista.'}
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className={CALENDAR_CLASSES} style={THEME}>
        {narrow !== null ? (
          <FullCalendar
            // Al cambiar de estudiante se vuelve a montar y vuelve a pedir el rango visible.
            key={studentId}
            ref={calendarRef}
            plugins={[dayGridPlugin, listPlugin, limaTimeZonePlugin]}
            timeZone={LIMA_TIME_ZONE}
            locale={esLocale}
            initialView={narrow ? 'listMonth' : 'dayGridMonth'}
            headerToolbar={{
              start: 'prev,next today',
              center: 'title',
              end: narrow ? 'listMonth' : 'dayGridMonth,listMonth',
            }}
            buttonText={{ today: 'Hoy', month: 'Mes', list: 'Lista' }}
            height="auto"
            dayMaxEvents={3}
            eventDisplay="block"
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            noEventsContent="No hay plazos en este período."
            events={loadEvents}
            eventDidMount={onEventMount}
            navLinks={false}
            editable={false}
            selectable={false}
          />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando calendario…
          </p>
        )}
      </div>
    </div>
  );
}
