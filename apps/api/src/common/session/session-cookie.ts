import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'aula_sid';

// httpOnly: no accesible desde JS. sameSite=lax: mitiga CSRF. secure: solo HTTPS en produccion (RNF-05).
export function sessionCookieOptions(isProduction: boolean, ttlSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds * 1000,
  };
}
