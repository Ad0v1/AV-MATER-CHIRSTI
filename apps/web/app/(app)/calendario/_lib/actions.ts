'use server';

// Carga de plazos para el calendario (RF-54) como Server Action (D-037): FullCalendar la llama al
// cambiar de mes o de vista. La API decide qué cursos ve el usuario; aquí solo se valida la forma
// de los argumentos (vienen del navegador).
import { toUserMessage } from '@/lib/api/errors';
import { apiServer } from '@/lib/api/server';
import { calendarQuery, isUuid, validRange, type CalendarView } from './calendar';

export type LoadResult = { ok: true; view: CalendarView } | { ok: false; message: string };

export async function loadCalendarAction(
  from: unknown,
  to: unknown,
  studentId: unknown,
): Promise<LoadResult> {
  if (!validRange(from, to)) return { ok: false, message: 'Rango de fechas no válido.' };
  if (studentId !== null && !isUuid(studentId)) {
    return { ok: false, message: 'Estudiante no válido. Vuelve a cargar la página.' };
  }
  try {
    const view = await apiServer.get<CalendarView>(
      `/me/calendar?${calendarQuery(from as string, to as string, studentId ?? undefined)}`,
    );
    return { ok: true, view };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
