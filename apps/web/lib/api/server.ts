// TEMPORAL (F5, D-037): cliente de la API para Server Components y Server Actions, hasta que
// Dev 1 publique el suyo con el login real.
//
// Reglas (no cambiarlas sin pasar por seguridad-cumplimiento):
// - Solo corre en el servidor (`server-only`): el token nunca llega al navegador.
// - Reenvía SOLO la cookie de sesión `aula_sid`; ninguna otra cookie ni cabecera del navegador.
// - `cache: 'no-store'` siempre. Nunca usar `'use cache'` con funciones que llamen aquí: las
//   respuestas dependen de la sesión.
// - Nunca registra cuerpos, tokens ni respuestas.
import 'server-only';
import { cookies } from 'next/headers';
import { ApiError, networkError, parseApiError } from './errors';
import { SESSION_COOKIE, assertApiPath, sessionCookieHeader } from './request-guards';

export { SESSION_COOKIE };

const API_BASE = `${(process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;

const REQUEST_TIMEOUT_MS = 15_000;

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  assertApiPath(path);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const cookie = sessionCookieHeader((await cookies()).get(SESSION_COOKIE)?.value);
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw networkError();
  }

  if (!res.ok) {
    let payload: unknown = undefined;
    try {
      payload = await res.json();
    } catch {
      // cuerpo vacío o no JSON: se traduce solo por status
    }
    throw parseApiError(res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(502, 'BAD_RESPONSE', '');
  }
}

export const apiServer = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
};
