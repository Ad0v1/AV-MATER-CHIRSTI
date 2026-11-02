// Contraseña de PRUEBA del administrador del seed, solo para desarrollo local (login de Dev 1).
// El login con contraseña solo admite el rol ADMIN (auth.service.ts); los demás roles entran
// con la sesión de desarrollo (prisma/seed/dev-session.ts --email <correo>).
// Sin 2FA configurado: el login no pide código hasta que el admin lo active.
import { createRequire } from 'node:module';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { ADMIN } from './fixtures.js';

export const DEV_ADMIN_PASSWORD = 'MaterChristi-Dev-2026';

const requireFromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { hash, argon2id } = requireFromApi('argon2') as typeof import('argon2');

export async function seedDevCredentials(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { institutionalEmail: ADMIN.institutionalEmail },
    select: { id: true },
  });
  if (!admin) return;
  const passwordHash = await hash(DEV_ADMIN_PASSWORD, { type: argon2id });
  await prisma.localCredential.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, passwordHash },
    update: { passwordHash },
  });
}
