export const ROLES = ['estudiante', 'docente', 'admin', 'apoderado'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administrador',
  apoderado: 'Apoderado',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
