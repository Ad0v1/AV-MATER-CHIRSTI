import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/config.module.js';
import { USER_ROLES, type AuthenticatedUser } from '../auth/roles.js';
import { SessionStore } from './session.store.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly store: SessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get ttlSeconds(): number {
    return this.env.SESSION_TTL_SECONDS;
  }

  // El token viaja solo en la cookie; en el almacen se guarda su hash, para que
  // una fuga de Redis no permita suplantar sesiones.
  async create(user: AuthenticatedUser): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.store.set(this.key(token), JSON.stringify(user), this.ttlSeconds);
    return token;
  }

  async resolve(token: string): Promise<AuthenticatedUser | null> {
    const raw = await this.store.get(this.key(token));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<AuthenticatedUser>;
      if (typeof parsed.id === 'string' && USER_ROLES.some((r) => r === parsed.role)) {
        return { id: parsed.id, role: parsed.role as AuthenticatedUser['role'] };
      }
    } catch {
      // sesion corrupta: se trata como inexistente
    }
    return null;
  }

  destroy(token: string): Promise<void> {
    return this.store.del(this.key(token));
  }

  private key(token: string): string {
    return `session:${createHash('sha256').update(token).digest('hex')}`;
  }
}
