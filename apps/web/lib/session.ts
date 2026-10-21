import { cookies } from 'next/headers';
import { isRole, type Role } from '@/lib/roles';

export const DEV_ROLE_COOKIE = 'dev-role';

// TEMPORAL: rol simulado por cookie hasta tener login real (RF-01..07).
// Debe reemplazarse por la sesion del backend; nunca usarlo para decidir permisos.
export async function getCurrentRole(): Promise<Role> {
  const value = (await cookies()).get(DEV_ROLE_COOKIE)?.value;
  return isRole(value) ? value : 'admin';
}
