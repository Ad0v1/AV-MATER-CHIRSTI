import type { PrismaClient } from './../src/generated/prisma/client.js';
import { assertNotProductionOrCi, hostOf } from './../../../prisma/seed/local-guard.js';

// Guarda para los e2e que hacen DDL (quitar y reponer triggers). Pedido de seguridad (INFORME 6,
// MEDIO 1, e INFORME 12, MEDIO 1): antes de cualquier DDL se exige la confirmación explícita
// E2E_ALLOW_DDL=1, BD local, BD esperada, NODE_ENV distinto de production y CI apagado. Los
// mensajes nunca incluyen la URL ni la contraseña.

type Env = Record<string, string | undefined>;

/** Hosts permitidos para DDL de prueba (sin los corchetes de IPv6 que deja URL.hostname). */
export const TEST_DB_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'mysql',
]);

/** Nombre de la BD local del docker compose; se puede cambiar con E2E_DB_NAME. */
export const DEFAULT_TEST_DB_NAME = 'aula_virtual';

const WHO = 'El DDL de los e2e';

/** Variable de confirmación explícita: solo el valor exacto "1" habilita el DDL. */
export const ALLOW_DDL_ENV = 'E2E_ALLOW_DDL';

/** CI activo con cualquier valor que no sea vacío, "false" o "0". */
const ciActive = (env: Env): boolean => {
  const ci = env.CI?.trim().toLowerCase();
  return ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';
};

/**
 * Comprobaciones sin BD (puras): NODE_ENV, CI, host local y nombre de la BD en la URL.
 * Devuelve el nombre de BD esperado.
 */
export function assertLocalTestDbEnv(env: Env = process.env): string {
  if (env[ALLOW_DDL_ENV] !== '1') {
    throw new Error(`${WHO} exige la confirmación explícita ${ALLOW_DDL_ENV}=1.`);
  }
  assertNotProductionOrCi(env, WHO);
  if (ciActive(env)) throw new Error(`${WHO} no se ejecuta en CI.`);
  const url = env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL.');
  if (!TEST_DB_HOSTS.has(hostOf(url, 'DATABASE_URL'))) {
    throw new Error(
      `${WHO} solo corre contra localhost, 127.0.0.1, ::1 o el servicio mysql del docker compose.`,
    );
  }
  const expected = env.E2E_DB_NAME?.trim() || DEFAULT_TEST_DB_NAME;
  const inUrl = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (inUrl !== expected) {
    throw new Error(`${WHO} solo corre contra la base ${expected}.`);
  }
  return expected;
}

/** Todas las condiciones, incluida `SELECT DATABASE()` en la conexión que hará el DDL. */
export async function assertLocalTestDb(
  client: PrismaClient,
  env: Env = process.env,
): Promise<void> {
  const expected = assertLocalTestDbEnv(env);
  const rows = await client.$queryRawUnsafe<{ db: string | null }[]>('SELECT DATABASE() AS db');
  if (rows[0]?.db !== expected) {
    throw new Error(`${WHO}: la conexión no está en la base ${expected}.`);
  }
}

// Triggers de inmutabilidad de SubmissionVersion (migración 20261029224632_contents_base).
const NO_DELETE = 'SubmissionVersion_no_delete';
const CREATE_NO_DELETE =
  "CREATE TRIGGER `SubmissionVersion_no_delete` BEFORE DELETE ON `SubmissionVersion` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubmissionVersion es inmutable'";

async function triggerExists(client: PrismaClient, name: string): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<{ n: bigint | number }[]>(
    'SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?',
    name,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Repone el trigger de DELETE si una corrida anterior se cortó con él quitado.
 * `ddl` debe usar el protocolo de texto (`PrismaMariaDb(url, { useTextProtocol: true })`):
 * MySQL no acepta CREATE/DROP TRIGGER como sentencia preparada (error 1295).
 */
export async function ensureSubmissionVersionTrigger(ddl: PrismaClient): Promise<void> {
  if (await triggerExists(ddl, NO_DELETE)) return;
  await assertLocalTestDb(ddl);
  await ddl.$executeRawUnsafe(CREATE_NO_DELETE);
}

/**
 * Ejecuta `fn` (borrado de versiones de prueba) con el trigger de DELETE quitado y lo repone
 * siempre al final. Lanza antes de cualquier DDL si la guarda no se cumple.
 */
export async function withoutSubmissionVersionTrigger<T>(
  ddl: PrismaClient,
  fn: () => Promise<T>,
  env: Env = process.env,
): Promise<T> {
  await assertLocalTestDb(ddl, env);
  await ddl.$executeRawUnsafe(`DROP TRIGGER IF EXISTS \`${NO_DELETE}\``);
  let result: T;
  try {
    result = await fn();
  } catch (original: unknown) {
    // Si también falla la reposición, se informan los dos errores sin ocultar el original.
    try {
      await ddl.$executeRawUnsafe(CREATE_NO_DELETE);
    } catch (restore: unknown) {
      throw new AggregateError(
        [original, restore],
        `${WHO}: falló el borrado y también la reposición del trigger ${NO_DELETE}.`,
      );
    }
    throw original;
  }
  await ddl.$executeRawUnsafe(CREATE_NO_DELETE);
  return result;
}
