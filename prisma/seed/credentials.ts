// Contrasena del administrador del seed, solo para desarrollo local (D-058). Los demas usuarios
// del seed tienen codigo pero no contrasena: no hay credenciales compartidas de prueba.
import type { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { hashPassword } from '../../apps/api/src/modules/auth/password-hash.js';
import {
  checkPasswordPolicy,
  generateInitialPassword,
} from '../../apps/api/src/modules/auth/password-policy.js';
import { ADMIN } from './fixtures.js';

// Con SEED_ADMIN_PASSWORD el desarrollador elige la clave y queda lista para usar. Sin ella se
// genera una aleatoria, que se muestra una sola vez y obliga a cambiarla en el primer ingreso.
// Si el administrador ya tiene clave y no se pide otra, no se toca (el seed es idempotente).
export async function seedAdminCredential(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { institutionalEmail: ADMIN.institutionalEmail },
    select: { id: true, code: true, localCredential: { select: { userId: true } } },
  });
  if (!admin?.code) throw new Error('El administrador del seed no tiene codigo de usuario.');

  // Solo en local: el administrador del seed ya tiene su correo verificado, para poder entrar sin
  // depender del servidor de correo. Los demas usuarios del seed lo verifican en su primer ingreso.
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      contactEmail: ADMIN.institutionalEmail,
      contactEmailIsGuardian: false,
      emailVerifiedAt: new Date(),
    },
  });

  const chosen = process.env.SEED_ADMIN_PASSWORD;
  if (admin.localCredential && !chosen) {
    console.log(`Administrador del seed: codigo ${admin.code} (la contrasena no se cambio).`);
    return;
  }

  if (chosen && checkPasswordPolicy(chosen).length > 0) {
    throw new Error('SEED_ADMIN_PASSWORD no cumple la politica de contrasenas.');
  }
  const password = chosen ?? generateInitialPassword();
  const data = {
    passwordHash: await hashPassword(password),
    mustChangePassword: !chosen,
    passwordChangedAt: null,
  };
  await prisma.localCredential.upsert({
    where: { userId: admin.id },
    create: { userId: admin.id, ...data },
    update: data,
  });

  console.log(`Administrador del seed: codigo ${admin.code}`);
  if (!chosen) {
    console.log(`Contrasena inicial (se muestra una sola vez): ${password}`);
    console.log('Se pedira cambiarla en el primer ingreso.');
  }
}
