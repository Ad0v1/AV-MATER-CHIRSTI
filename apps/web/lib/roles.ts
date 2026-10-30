// Mismos nombres que la API (UserRole). Un solo rol por usuario (D-012).
export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN', 'GUARDIAN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Docente',
  ADMIN: 'Administrador',
  GUARDIAN: 'Apoderado',
};

// Pagina de inicio por rol tras iniciar sesion (RF-06).
// Docente y estudiante aterrizan en "/" hasta que exista la lista real de cursos (Dev 2, RF-14).
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: '/admin/estructura',
  TEACHER: '/',
  STUDENT: '/',
  GUARDIAN: '/apoderado',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
