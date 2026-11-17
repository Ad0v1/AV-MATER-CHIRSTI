import 'server-only';

// Datos reales del inicio (reemplaza a datos-demo.ts). Cada bloque se carga por separado: si uno
// falla, ese bloque se muestra vacío con un aviso y el resto de la pantalla sigue funcionando.
import { apiServer } from '@/lib/api/server';
import { sectionLabel, type MyCourseSection } from '@/components/layout/course-nav-model';
import { calendarQuery, type CalendarView } from '../calendario/_lib/calendar';
import type { AnnouncementPage } from '../anuncios/_lib/announcements';

export type CursoInicio = { id: string; nombre: string; seccion: string; docente: string | null };
export type EntregaInicio = {
  id: string;
  titulo: string;
  curso: string;
  venceEn: string;
  dias: number;
};
export type AvisoInicio = { id: string; titulo: string; fecha: string; texto: string };
export type Bloque<T> = { items: T[]; error: boolean };

export type DatosInicio = {
  cursos: Bloque<CursoInicio>;
  entregas: Bloque<EntregaInicio>;
  avisos: Bloque<AvisoInicio>;
};

const DIA_MS = 86_400_000;
const DIAS_ENTREGAS = 14;
const fechaCorta = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Lima',
});

async function bloque<T>(cargar: () => Promise<T[]>): Promise<Bloque<T>> {
  try {
    return { items: await cargar(), error: false };
  } catch {
    return { items: [], error: true };
  }
}

export async function cargarDatosInicio(esEstudiante: boolean): Promise<DatosInicio> {
  const ahora = new Date();
  const [cursos, entregas, avisos] = await Promise.all([
    bloque(async () => {
      const res = await apiServer.get<{ items: MyCourseSection[] }>('/me/course-sections');
      return (Array.isArray(res?.items) ? res.items : [])
        .map((c) => ({
          id: c.id,
          nombre: c.course.name,
          seccion: sectionLabel(c.section),
          docente: c.teacher?.fullName ?? null,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }),
    esEstudiante
      ? bloque(async () => {
          const desde = ahora.toISOString();
          const hasta = new Date(ahora.getTime() + DIAS_ENTREGAS * DIA_MS).toISOString();
          const view = await apiServer.get<CalendarView>(
            `/me/calendar?${calendarQuery(desde, hasta)}`,
          );
          return (view?.items ?? [])
            .filter((i) => new Date(i.dueAt).getTime() >= ahora.getTime())
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
            .slice(0, 5)
            .map((i) => ({
              id: i.assignmentId,
              titulo: i.title,
              curso: i.course.name,
              venceEn: i.dueAt,
              dias: Math.floor((new Date(i.dueAt).getTime() - ahora.getTime()) / DIA_MS),
            }));
        })
      : Promise.resolve({ items: [], error: false }),
    bloque(async () => {
      const page = await apiServer.get<AnnouncementPage>('/me/announcements?page=1');
      return (page?.items ?? []).slice(0, 3).map((a) => ({
        id: a.id,
        titulo: a.title,
        fecha: fechaCorta.format(new Date(a.publishedAt)),
        texto: a.body.length > 160 ? `${a.body.slice(0, 157)}…` : a.body,
      }));
    }),
  ]);
  return { cursos, entregas, avisos };
}
