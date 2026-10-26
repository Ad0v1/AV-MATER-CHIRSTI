// Seed de desarrollo con datos ficticios (D-028). Uso: `pnpm db:seed` (local con Docker).
// Nunca en produccion: el seed crea cuentas de prueba con correos @colegio.example.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { seedAcademic } from './academic.js';
import { ALL_USERS, SEED_EMAIL_DOMAIN } from './fixtures.js';

// Hosts permitidos para el seed: maquina local o el servicio `mysql` del docker compose.
const ALLOWED_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'mysql']);

// Devuelve la URL solo si apunta a una base local. Nunca incluye la URL ni la
// contrasena en los mensajes de error.
function assertLocalDatabase(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed de datos ficticios no se ejecuta con NODE_ENV=production.');
  }
  if (process.env.CI === 'true') {
    throw new Error('El seed de datos ficticios no se ejecuta en CI (CI=true).');
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL (copia .env.example a .env).');
  }
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error('DATABASE_URL no es una URL valida.');
  }
  if (!ALLOWED_DB_HOSTS.has(host)) {
    throw new Error(
      'DATABASE_URL no apunta a una base local: el seed solo corre contra ' +
        'localhost, 127.0.0.1, ::1 o el servicio mysql del docker compose.',
    );
  }
  return url;
}

async function main(): Promise<void> {
  // Todas las comprobaciones van antes de crear el cliente de Prisma.
  const url = assertLocalDatabase();
  // Defensa: ningun dato del seed puede salir del dominio ficticio.
  const outside = ALL_USERS.filter((u) => !u.institutionalEmail.endsWith(`@${SEED_EMAIL_DOMAIN}`));
  if (outside.length > 0) {
    throw new Error(`Correos fuera de @${SEED_EMAIL_DOMAIN}: ${outside.length}`);
  }

  // Mismo cliente que la API (apps/api/src/common/prisma/prisma.service.ts).
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    await seedAcademic(prisma);
    const [years, periods, sections, courses, courseSections, enrollments, users] =
      await Promise.all([
        prisma.academicYear.count(),
        prisma.academicPeriod.count(),
        prisma.section.count(),
        prisma.course.count(),
        prisma.courseSection.count(),
        prisma.enrollment.count(),
        prisma.user.count(),
      ]);
    console.log(
      `Seed listo: ${users} usuarios, ${years} años, ${periods} periodos, ${sections} secciones, ` +
        `${courses} cursos, ${courseSections} cursos-seccion, ${enrollments} matriculas.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Solo el mensaje: el objeto completo puede incluir host o URL de conexion.
  console.error(`Seed fallido: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
