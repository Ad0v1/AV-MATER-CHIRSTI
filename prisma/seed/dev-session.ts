// TEMPORAL (F5, D-037): crea una sesion de la API para un usuario del seed, SOLO en local,
// mientras no exista el login de Dev 1 (RF-01..07). Cuando haya login, este script se borra.
//
// Uso (desde la raiz, con Docker levantado y el seed cargado):
//   pnpm exec tsx --tsconfig apps/api/tsconfig.json prisma/seed/dev-session.ts [--email <correo>]
//
// - Se niega a correr con NODE_ENV=production, con CI=true o si DATABASE_URL o REDIS_URL no
//   apuntan a servicios locales (local-guard.ts).
// - Solo acepta correos del seed (@colegio.example) de usuarios ACTIVE. Por defecto, el ADMIN.
// - Usa el SessionService de Dev 1 como import de solo lectura (no se modifica): el token se
//   guarda en Redis como `session:<sha256>` con el mismo TTL que la API.
// - Imprime solo el token y como crear la cookie `aula_sid`; nunca la URL de la base ni datos
//   del usuario.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { SessionService } from '../../apps/api/src/common/session/session.service.js';
import { RedisSessionStore } from '../../apps/api/src/common/session/redis-session.store.js';
import { SESSION_COOKIE } from '../../apps/api/src/common/session/session-cookie.js';
import { loadEnv } from '../../apps/api/src/config/env.js';
import { ADMIN, ALL_USERS, SEED_EMAIL_DOMAIN } from './fixtures.js';
import { assertLocalDatabase, assertLocalRedis } from './local-guard.js';

const WHO = 'El script de sesion local';

function parseEmail(argv: string[]): string {
  const i = argv.indexOf('--email');
  if (i === -1) return ADMIN.institutionalEmail;
  const value = argv[i + 1]?.trim().toLowerCase();
  if (!value) throw new Error('Falta el correo despues de --email.');
  return value;
}

async function main(): Promise<void> {
  // Todas las comprobaciones van antes de abrir conexiones.
  const dbUrl = assertLocalDatabase(process.env, WHO);
  const redisUrl = assertLocalRedis(process.env);
  const email = parseEmail(process.argv.slice(2));
  const seedEmails = new Set(ALL_USERS.map((u) => u.institutionalEmail));
  if (!email.endsWith(`@${SEED_EMAIL_DOMAIN}`) || !seedEmails.has(email)) {
    throw new Error(`Solo se permiten correos del seed (@${SEED_EMAIL_DOMAIN}).`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });
  let user: { id: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'GUARDIAN'; status: string };
  try {
    const found = await prisma.user.findUnique({
      where: { institutionalEmail: email },
      select: { id: true, role: true, status: true },
    });
    if (!found) throw new Error('El usuario no existe; corre antes `pnpm db:seed`.');
    if (found.status !== 'ACTIVE') throw new Error('El usuario no esta ACTIVE.');
    user = found;
  } finally {
    await prisma.$disconnect();
  }

  // Mismo Env que la API, con REDIS_URL ya comprobado como local.
  const env = loadEnv({ ...process.env, REDIS_URL: redisUrl });
  const store = new RedisSessionStore(env);
  try {
    const token = await new SessionService(store, env).create({ id: user.id, role: user.role });
    const hours = Math.round((env.SESSION_TTL_SECONDS / 3600) * 10) / 10;
    console.log(`Sesion local creada (rol ${user.role}, dura ${hours} h). Token:`);
    console.log(token);
    console.log(
      'Es una credencial de acceso: no lo compartas ni lo subas a ningún sitio (chat, Git, capturas).',
    );
    console.log('');
    console.log('Como usarla en http://localhost:3000:');
    console.log(
      `  Navegador: DevTools > Application > Cookies > http://localhost:3000 > nueva cookie ` +
        `"${SESSION_COOKIE}" con ese valor (Path /).`,
    );
    console.log(
      `  curl: curl -b "${SESSION_COOKIE}=<token>" http://localhost:3000/admin/estructura`,
    );
  } finally {
    await store.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  // Solo el mensaje: el objeto completo puede incluir host o URL de conexion.
  console.error(`${WHO} fallo: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
