import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

@Injectable()
export class PasswordService {
  // Hash usado para gastar el mismo tiempo cuando el correo no existe (evita deducir cuentas por tiempo).
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('contrasena-ficticia');
    await this.verify(await this.dummyHash, password);
  }
}
