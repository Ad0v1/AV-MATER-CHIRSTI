import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../config/config.module.js';
import { USER_ROLES, type AuthenticatedUser } from '../auth/roles.js';
import { SessionStore } from './session.store.js';

type StoredSession = AuthenticatedUser & { iat: number };

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
    const stored: StoredSession = { ...user, iat: Date.now() };
    await this.store.set(this.key(token), JSON.stringify(stored), this.ttlSeconds);
    return token;
  }

  async resolve(token: string): Promise<AuthenticatedUser | null> {
    const raw = await this.store.get(this.key(token));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (typeof parsed.id === 'string' && USER_ROLES.some((r) => r === parsed.role)) {
        // Una sesion anterior al ultimo cierre masivo del usuario ya no vale (RF-78).
        const revokedAt = await this.store.get(this.revokedKey(parsed.id));
        if (revokedAt && (parsed.iat ?? 0) < Number(revokedAt)) return null;
        return {
          id: parsed.id,
          role: parsed.role as AuthenticatedUser['role'],
          ...(parsed.mustChangePassword === true ? { mustChangePassword: true as const } : {}),
          ...(parsed.mustVerifyEmail === true ? { mustVerifyEmail: true as const } : {}),
        };
      }
    } catch {
      // sesion corrupta: se trata como inexistente
    }
    return null;
  }

  destroy(token: string): Promise<void> {
    return this.store.del(this.key(token));
  }

  // Cierra todas las sesiones abiertas del usuario (RF-78): cambio o restablecimiento de la
  // contrasena, o baja. Guarda la marca de tiempo; las sesiones creadas antes dejan de resolverse.
  // Una sesion nueva creada despues (por ejemplo, la del propio cambio de contrasena) si vale.
  revokeAll(userId: string): Promise<void> {
    return this.store.set(this.revokedKey(userId), String(Date.now()), this.ttlSeconds);
  }

  private key(token: string): string {
    return `session:${createHash('sha256').update(token).digest('hex')}`;
  }

  private revokedKey(userId: string): string {
    return `session-revoked:${userId}`;
  }
}
