// Seed de desarrollo con datos ficticios (D-028). Uso: `pnpm db:seed` (local con Docker).
// Nunca en produccion: el seed crea cuentas de prueba con correos @colegio.example.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { seedAcademic } from './academic.js';
import { seedAdminCredential } from './credentials.js';
import { ALL_USERS, SEED_EMAIL_DOMAIN } from './fixtures.js';
// Comprobaciones de entorno local compartidas con dev-session.ts (F5).
import { assertLocalDatabase } from './local-guard.js';

async function main(): Promise<void> {
  // Todas las comprobaciones van antes de crear el cliente de Prisma.
  const url = assertLocalDatabase();
  // Defensa: ningun dato del seed puede salir del dominio ficticio.
  const outside = ALL_USERS.filter((u) => !u.email.endsWith(`@${SEED_EMAIL_DOMAIN}`));
  if (outside.length > 0) {
    throw new Error(`Correos fuera de @${SEED_EMAIL_DOMAIN}: ${outside.length}`);
  }

  // Mismo cliente que la API (apps/api/src/common/prisma/prisma.service.ts).
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    await seedAcademic(prisma);
    await seedAdminCredential(prisma);
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
