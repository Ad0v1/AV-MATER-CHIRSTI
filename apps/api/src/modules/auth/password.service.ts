import { Injectable } from '@nestjs/common';
import { verify } from 'argon2';
import { hashPassword } from './password-hash.js';

@Injectable()
export class PasswordService {
  // Hash usado para gastar el mismo tiempo cuando el codigo no existe (evita deducir cuentas por tiempo).
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hashPassword(password);
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
