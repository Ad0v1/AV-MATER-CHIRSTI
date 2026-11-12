// Avisos (RF-53, Dev 5): tipos de GET /me/notifications y lógica pura de la campana.
import type { Role } from '@/lib/roles';
import { COURSE_ROUTES, ROUTES } from '@/lib/routes';

export type NotificationItem = {
  id: string;
  type: 'ASSIGNMENT_CREATED' | 'ASSIGNMENT_DUE_SOON' | 'GRADE_PUBLISHED' | 'ANNOUNCEMENT_PUBLISHED';
  createdAt: string;
  readAt: string | null;
  message: string;
  target: 'ASSIGNMENT' | 'GRADE' | 'ANNOUNCEMENT' | null;
  courseSectionId: string | null;
  studentId: string | null;
};

export type NotificationPage = {
  items: NotificationItem[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

/** Enlace del aviso según el rol; null si el recurso ya no está disponible. */
export function notificationHref(n: NotificationItem, role: Role): string | null {
  switch (n.target) {
    case 'ASSIGNMENT':
      if (role === 'GUARDIAN') return ROUTES.calendario;
      return n.courseSectionId ? COURSE_ROUTES.tareas(n.courseSectionId) : null;
    case 'GRADE':
      if (role === 'GUARDIAN') return ROUTES.apoderado;
      return role === 'STUDENT' ? ROUTES.misNotas : null;
    case 'ANNOUNCEMENT':
      return role === 'ADMIN' ? ROUTES.adminAnuncios : ROUTES.anuncios;
    default:
      return null;
  }
}

/** Texto del contador para lectores de pantalla y para el globo (99+). */
export function unreadLabel(count: number): { badge: string | null; aria: string } {
  if (count <= 0) return { badge: null, aria: 'Avisos, ninguno sin leer' };
  return {
    badge: count > 99 ? '99+' : String(count),
    aria: `Avisos, ${count} sin leer`,
  };
}

const limaDate = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : limaDate.format(d);
}
