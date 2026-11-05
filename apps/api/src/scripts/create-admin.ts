import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { loadDotenv } from '../config/dotenv.js';
import { loadEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { DniService } from '../modules/auth/dni.service.js';
import { hashPassword } from '../modules/auth/password-hash.js';
import { checkPasswordPolicy, generateInitialPassword } from '../modules/auth/password-policy.js';
import { generateUserCode } from '../modules/auth/user-code.js';

// Crea o actualiza la cuenta del administrador (RF-04, RF-68..70).
// Uso: ADMIN_DNI='12345678' [ADMIN_PASSWORD='...'] [ADMIN_EMAIL_VERIFIED=1] pnpm --filter api admin:create -- correo@colegio.edu.pe "Nombre Completo"
// El DNI y la contrasena van por variable de entorno para que no queden en el historial del terminal.
// Sin ADMIN_PASSWORD se genera una contrasena aleatoria que se muestra una sola vez. En ambos
// casos el administrador debe cambiarla en su primer ingreso.
loadDotenv();

async function main(): Promise<void> {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const fullName = nameParts.join(' ').trim() || 'Administrador';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Indica un correo valido como primer argumento');
  }

  const env = loadEnv();
  const dniService = new DniService(env);
  const dni = dniService.normalize(process.env.ADMIN_DNI ?? '');
  if (!dni) throw new Error('Define ADMIN_DNI con el DNI de 8 digitos');

  const chosen = process.env.ADMIN_PASSWORD;
  if (chosen && checkPasswordPolicy(chosen).length > 0) {
    throw new Error('ADMIN_PASSWORD no cumple la politica de contrasenas');
  }
  const password = chosen ?? generateInitialPassword();

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
  try {
    const dniHash = dniService.hash(dni);
    const owner = await prisma.user.findUnique({
      where: { dniHash },
      select: { institutionalEmail: true },
    });
    if (owner && owner.institutionalEmail !== email) {
      throw new Error('Ese DNI ya pertenece a otro usuario');
    }

    const existing = await prisma.user.findUnique({
      where: { institutionalEmail: email },
      select: { code: true },
    });
    let code = existing?.code ?? null;
    for (let i = 0; !code && i < 10; i++) {
      const candidate = generateUserCode();
      if (!(await prisma.user.findUnique({ where: { code: candidate }, select: { id: true } }))) {
        code = candidate;
      }
    }
    if (!code) throw new Error('No se pudo generar un codigo de usuario libre');

    // Con ADMIN_EMAIL_VERIFIED=1 el correo queda verificado sin enviar codigo: sirve para el
    // primer administrador, que no puede usar la verificacion manual de otro administrador (RF-88).
    const dniData = {
      dniEncrypted: dniService.encrypt(dni),
      dniHash,
      contactEmail: email,
      ...(process.env.ADMIN_EMAIL_VERIFIED === '1' ? { emailVerifiedAt: new Date() } : {}),
    };
    const user = await prisma.user.upsert({
      where: { institutionalEmail: email },
      create: {
        institutionalEmail: email,
        fullName,
        role: 'ADMIN',
        status: 'ACTIVE',
        code,
        ...dniData,
      },
      update: { role: 'ADMIN', status: 'ACTIVE', code, ...dniData },
    });
    const credential = {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordChangedAt: null,
    };
    await prisma.localCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...credential },
      update: credential,
    });

    console.log(`Administrador listo: codigo ${code} (id ${user.id})`);
    if (!chosen) {
      console.log(`Contrasena inicial (se muestra una sola vez): ${password}`);
    }
    console.log('Debera cambiar la contrasena en su primer ingreso.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
