import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { SecretBox } from '../../common/security/secret-box.js';
import { ENV, type Env } from '../../config/config.module.js';

@Injectable()
export class TotpService {
  private readonly box: SecretBox;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.box = new SecretBox(env.TOTP_ENCRYPTION_KEY);
  }

  newSecret(): string {
    return generateSecret();
  }

  otpauthUrl(accountLabel: string, secret: string): string {
    return generateURI({ issuer: this.env.TOTP_ISSUER, label: accountLabel, secret });
  }

  // Tolera un paso de 30 s hacia cada lado por diferencias de reloj.
  // Ante un secreto o codigo malformado responde false en vez de fallar con 500.
  verify(secret: string, code: string): boolean {
    try {
      return verifySync({ secret, token: code, epochTolerance: 30 }).valid;
    } catch {
      return false;
    }
  }

  encrypt(secret: string): string {
    return this.box.encrypt(secret);
  }

  decrypt(encrypted: string): string {
    return this.box.decrypt(encrypted);
  }
}
