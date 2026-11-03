import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PasswordService } from '../modules/auth/password.service.js';

// Crea o actualiza la cuenta local del administrador (RF-04).
// Uso: ADMIN_PASSWORD='...' pnpm --filter api admin:create -- correo@colegio.edu.pe "Nombre Completo"
// La contrasena va por variable de entorno para que no quede en el historial del terminal.
async function main(): Promise<void> {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  const email = emailArg?.trim().toLowerCase();
  const fullName = nameParts.join(' ').trim() || 'Administrador';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Indica un correo valido como primer argumento');
  }
  if (!password || password.length < 12) {
    throw new Error('Define ADMIN_PASSWORD con al menos 12 caracteres');
  }

  const env = loadEnv();
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
  try {
    const passwordHash = await new PasswordService().hash(password);
    const user = await prisma.user.upsert({
      where: { institutionalEmail: email },
      create: { institutionalEmail: email, fullName, role: 'ADMIN', status: 'ACTIVE' },
      update: { role: 'ADMIN', status: 'ACTIVE' },
    });
    await prisma.localCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      update: { passwordHash },
    });
    console.log(`Administrador listo: ${email} (id ${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
