import { createHmac, hkdfSync } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SecretBox } from '../../common/security/secret-box.js';
import { ENV, type Env } from '../../config/config.module.js';

// Clave solo para desarrollo y pruebas. En produccion PII_ENCRYPTION_KEY es obligatoria.
const DEV_MASTER_KEY = Buffer.alloc(32, 11);
const DNI_PATTERN = /^\d{8}$/;

// El DNI es dato personal de menores (D-059): se guarda cifrado y solo se compara por su hash con
// clave (HMAC), que impide repetidos sin poder recuperar el numero. De la clave maestra salen dos
// claves distintas, una para cifrar y otra para el hash.
@Injectable()
export class DniService {
  private readonly box: SecretBox;
  private readonly hashKey: Buffer;

  constructor(@Inject(ENV) env: Env) {
    const master = env.PII_ENCRYPTION_KEY
      ? Buffer.from(env.PII_ENCRYPTION_KEY, 'base64')
      : DEV_MASTER_KEY;
    this.box = new SecretBox(this.derive(master, 'dni-encryption').toString('base64'));
    this.hashKey = this.derive(master, 'dni-hash');
  }

  // Devuelve el DNI sin espacios si tiene 8 digitos; si no, null.
  normalize(input: string): string | null {
    const dni = input.trim();
    return DNI_PATTERN.test(dni) ? dni : null;
  }

  encrypt(dni: string): string {
    return this.box.encrypt(dni);
  }

  decrypt(encrypted: string): string {
    return this.box.decrypt(encrypted);
  }

  hash(dni: string): string {
    return createHmac('sha256', this.hashKey).update(dni).digest('hex');
  }

  private derive(master: Buffer, info: string): Buffer {
    return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  }
}
