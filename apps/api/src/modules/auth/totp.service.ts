import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { SecretBox } from '../../common/security/secret-box.js';
import { SessionStore } from '../../common/session/session.store.js';
import { ENV, type Env } from '../../config/config.module.js';

// Mas que los 3 intervalos que cubre la tolerancia (90 s), para que la marca no caduque antes.
const USED_TTL_SECONDS = 120;

@Injectable()
export class TotpService {
  private readonly box: SecretBox;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly store: SessionStore,
  ) {
    this.box = new SecretBox(env.TOTP_ENCRYPTION_KEY);
  }

  newSecret(): string {
    return generateSecret();
  }

  otpauthUrl(accountLabel: string, secret: string): string {
    return generateURI({ issuer: this.env.TOTP_ISSUER, label: accountLabel, secret });
  }

  // Un codigo TOTP solo vale una vez (RFC 6238, seccion 5.2): al aceptarlo se marca el intervalo
  // de 30 s del usuario como usado, de forma atomica, y un segundo intento con el mismo codigo falla.
  // Tolera un intervalo hacia cada lado por diferencias de reloj. Ante un secreto o codigo
  // malformado responde false en vez de fallar con 500.
  async verifyOnce(userId: string, secret: string, code: string): Promise<boolean> {
    let result: ReturnType<typeof verifySync>;
    try {
      result = verifySync({ secret, token: code, epochTolerance: 30 });
    } catch {
      return false;
    }
    if (!result.valid) return false;
    // El tipo declarado por otplib es una union con HOTP, que no trae timeStep; en TOTP si viene.
    const matched = result as { timeStep?: number; delta: number };
    const step = matched.timeStep ?? Math.floor(Date.now() / 30_000) + matched.delta;
    return this.store.setIfAbsent(`totp-used:${userId}:${step}`, '1', USED_TTL_SECONDS);
  }

  encrypt(secret: string): string {
    return this.box.encrypt(secret);
  }

  decrypt(encrypted: string): string {
    return this.box.decrypt(encrypted);
  }
}
