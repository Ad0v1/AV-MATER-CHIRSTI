import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Clave solo para desarrollo y pruebas. En produccion TOTP_ENCRYPTION_KEY es obligatoria.
const DEV_KEY = Buffer.alloc(32, 7);

// Cifrado AES-256-GCM (confidencialidad + integridad). Formato: v1.iv.tag.cifrado (base64url).
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key?: string) {
    this.key = base64Key ? Buffer.from(base64Key, 'base64') : DEV_KEY;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv, tag, data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de secreto invalido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
