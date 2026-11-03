import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME_BY_ROLE, isRole, type Role } from '@/lib/roles';

export const SESSION_COOKIE = 'aula_sid';

export type SessionUser = { id: string; role: Role; mustAcceptPolicy: boolean };

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Pregunta a la API quien es el usuario de la cookie. La sesion vive solo en la API (Redis):
// aqui no se decodifica nada, y siempre se consulta en cada peticion, sin cache (RNF-02).
// Debe llamarse dentro de <Suspense>: leer cookies es un dato de la peticion.
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const incoming = await headers();
  const forwardedFor = incoming.get('x-forwarded-for');
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        // Conserva la IP del usuario para el limite de intentos y la bitacora.
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SessionUser>;
    if (typeof data.id !== 'string' || !isRole(data.role)) return null;
    return { id: data.id, role: data.role, mustAcceptPolicy: data.mustAcceptPolicy === true };
  } catch {
    // API caida: se trata como sin sesion en vez de romper la pagina.
    return null;
  }
}

// Exige sesion valida; si no hay, manda al login.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}

// Exige uno de los roles indicados; si no, lleva al usuario a su pagina de inicio.
// Es solo comodidad de navegacion: el backend vuelve a validar el rol en cada peticion.
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect(HOME_BY_ROLE[user.role]);
  return user;
}
