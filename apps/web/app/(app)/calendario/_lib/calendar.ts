// Calendario de plazos (RF-54): tipos de GET /me/calendar y armado de eventos (lógica pura,
// probada con Vitest).

export type CalendarItem = {
  assignmentId: string;
  title: string;
  dueAt: string;
  allowLate: boolean;
  courseSectionId: string;
  course: { id: string; name: string };
  section: { id: string; gradeLevel: number; code: string };
  students?: { id: string; fullName: string }[];
};

export type CalendarView = { from: string; to: string; items: CalendarItem[]; truncated: boolean };

export type GuardianStudent = { studentId: string; fullName: string };

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  allDay: false;
  url?: string;
  extendedProps: { label: string };
};

/** La API acepta hasta 62 días; las vistas de mes y lista piden como mucho 42. */
export const MAX_RANGE_DAYS = 62;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Instante ISO con segundos y zona, como el startStr/endStr de FullCalendar. Igual que la API
// (z.iso.datetime con offset): sin segundos se rechaza.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Comprueba el rango antes de llamar a la API (los argumentos de la acción vienen del navegador). */
export function validRange(from: unknown, to: unknown): boolean {
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  if (!ISO_WITH_ZONE.test(from) || !ISO_WITH_ZONE.test(to)) return false;
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b > a && b - a <= MAX_RANGE_DAYS * DAY_MS;
}

/** Query de GET /me/calendar. */
export function calendarQuery(from: string, to: string, studentId?: string): string {
  const q = new URLSearchParams({ from, to });
  if (studentId) q.set('studentId', studentId);
  return q.toString();
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? '';

/**
 * Eventos de FullCalendar. Título corto "Curso: tarea" (sin instrucciones ni notas). El apoderado
 * con varios estudiantes ve el nombre de pila de a quién corresponde. `taskHref` arma el enlace a
 * las tareas del curso (estudiante y docente); el apoderado no tiene esa pantalla.
 */
export function toEvents(
  items: CalendarItem[],
  options: { taskHref?: (courseSectionId: string) => string; showStudents?: boolean } = {},
): CalendarEvent[] {
  return items.map((item) => {
    const who =
      options.showStudents && item.students && item.students.length > 0
        ? ` (${item.students.map((s) => firstName(s.fullName)).join(', ')})`
        : '';
    const section = `${item.section.gradeLevel}.° ${item.section.code}`;
    const title = `${item.course.name}: ${item.title}${who}`;
    return {
      id: item.assignmentId,
      title,
      start: item.dueAt,
      allDay: false,
      ...(options.taskHref ? { url: options.taskHref(item.courseSectionId) } : {}),
      extendedProps: {
        label: `${title}. ${section}. Vence ${formatDue(item.dueAt)}${item.allowLate ? ', acepta entregas tardías' : ''}.`,
      },
    };
  });
}

/** Fecha y hora de vencimiento en Lima, para el lector de pantalla. */
export function formatDue(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Texto para la región de estado tras cargar un rango. */
export function summaryText(count: number, truncated: boolean): string {
  if (count === 0) return 'No hay plazos en este período.';
  const base = count === 1 ? '1 plazo en este período.' : `${count} plazos en este período.`;
  return truncated ? `${base} Hay más: acorta el rango para verlos todos.` : base;
}
