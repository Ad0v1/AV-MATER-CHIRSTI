// TEMPORAL (F5, D-037): comprobaciones puras del cliente de la API (sin `server-only`, para
// poder probarlas con Vitest). Las usa `server.ts`; no cambiarlas sin seguridad-cumplimiento.

export const SESSION_COOKIE = 'aula_sid';

// El token de la API es base64url de 32 bytes (43 caracteres). Si la cookie trae otra cosa no
// se reenvía: así no se puede inyectar texto en la cabecera Cookie.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export const isValidSessionToken = (token: unknown): token is string =>
  typeof token === 'string' && TOKEN_PATTERN.test(token);

/** Cabecera `Cookie` con solo `aula_sid`, o undefined si el token no es válido. */
export function sessionCookieHeader(token: string | undefined): string | undefined {
  return isValidSessionToken(token) ? `${SESSION_COOKIE}=${token}` : undefined;
}

/** Solo rutas relativas de la API, sin esquema, sin `..`, sin barras dobles ni espacios. */
export function assertApiPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /\s/.test(path)) {
    throw new Error('Ruta de API no válida');
  }
}
