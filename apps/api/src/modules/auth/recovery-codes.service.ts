import { createHmac, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ENV, type Env } from '../../config/config.module.js';

// Misma clave de desarrollo que SecretBox: en produccion TOTP_ENCRYPTION_KEY es obligatoria.
const DEV_KEY = Buffer.alloc(32, 7);

/** Cuantos codigos de recuperacion se entregan juntos (RF-85). */
export const RECOVERY_CODE_COUNT = 10;
// Sin 0/O, 1/I/L para que se lean bien en un papel: 31 simbolos x 10 = 49 bits de entropia.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;

type Db = Pick<Prisma.TransactionClient, 'recoveryCode'>;

/** Quita guiones y espacios y pasa a mayusculas: el usuario puede escribirlo como quiera. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** Forma legible: XXXXX-XXXXX. */
const display = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

@Injectable()
export class RecoveryCodesService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.key = env.TOTP_ENCRYPTION_KEY ? Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64') : DEV_KEY;
  }

  // Los codigos son aleatorios de 49 bits y de un solo uso: un HMAC con clave basta (no hace falta
  // un hash lento) y permite buscarlos por indice unico sin recorrer los del usuario.
  hash(normalizedCode: string): string {
    return createHmac('sha256', this.key).update(`recovery:${normalizedCode}`).digest('hex');
  }

  // Reemplaza todos los codigos del usuario por un juego nuevo y devuelve los codigos en claro.
  // Esta es la unica vez que existen en claro: solo se guardan con hash.
  async issue(userId: string, db: Db = this.prisma): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newCode());
    await db.recoveryCode.deleteMany({ where: { userId } });
    await db.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: this.hash(code) })),
    });
    return codes.map(display);
  }

  // Gasta un codigo de forma atomica: si dos peticiones lo envian a la vez, solo una lo consigue.
  async consume(userId: string, input: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(input);
    if (normalized.length !== CODE_LENGTH) return false;
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: this.hash(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  remaining(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  async revokeAll(userId: string, db: Db = this.prisma): Promise<void> {
    await db.recoveryCode.deleteMany({ where: { userId } });
  }
}

function newCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
