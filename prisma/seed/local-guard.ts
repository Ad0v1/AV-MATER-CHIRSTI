// Comprobaciones compartidas por los scripts de desarrollo (seed y sesion local, D-028).
// Sin dependencias: lo importan `index.ts`, `dev-session.ts` y los tests de apps/web.
// Nunca incluyen la URL ni la contrasena en los mensajes de error.

type Env = Record<string, string | undefined>;

// Hosts permitidos: maquina local o el servicio del docker compose (mismos que antes de F5).
export const ALLOWED_DB_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'mysql',
]);
export const ALLOWED_REDIS_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'redis',
]);

/** Rechaza produccion y CI. `who` es el sujeto del mensaje ("El seed de datos ficticios"). */
export function assertNotProductionOrCi(env: Env, who: string): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(`${who} no se ejecuta con NODE_ENV=production.`);
  }
  if (env.CI === 'true') {
    throw new Error(`${who} no se ejecuta en CI (CI=true).`);
  }
}

/** Devuelve el host en minusculas o lanza un error sin mostrar la URL. */
export function hostOf(url: string, variable: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`${variable} no es una URL valida.`);
  }
}

/**
 * Devuelve DATABASE_URL solo si apunta a una base local. Mismos mensajes que el seed
 * tenia en `index.ts` antes de la fase 5.
 */
export function assertLocalDatabase(
  env: Env = process.env,
  who = 'El seed de datos ficticios',
): string {
  assertNotProductionOrCi(env, who);
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL (copia .env.example a .env).');
  }
  if (!ALLOWED_DB_HOSTS.has(hostOf(url, 'DATABASE_URL'))) {
    throw new Error(
      'DATABASE_URL no apunta a una base local: el seed solo corre contra ' +
        'localhost, 127.0.0.1, ::1 o el servicio mysql del docker compose.',
    );
  }
  return url;
}

/** Valor por defecto de la API (apps/api/src/config/env.ts). */
export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/** Devuelve REDIS_URL (o el valor por defecto) solo si apunta a un Redis local. */
export function assertLocalRedis(env: Env = process.env): string {
  const url = env.REDIS_URL || DEFAULT_REDIS_URL;
  if (!ALLOWED_REDIS_HOSTS.has(hostOf(url, 'REDIS_URL'))) {
    throw new Error(
      'REDIS_URL no apunta a un Redis local: solo se permite localhost, 127.0.0.1, ::1 ' +
        'o el servicio redis del docker compose.',
    );
  }
  return url;
}
