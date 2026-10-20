import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SessionStore } from '../../common/session/session.store.js';
import { ENV, type Env } from '../../config/config.module.js';
import type { LoginDto } from './auth.dto.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';

const INVALID_CREDENTIALS = 'Credenciales invalidas';
const SETUP_TTL_SECONDS = 10 * 60;

export type LoginResult = { user: AuthenticatedUser; mustAcceptPolicy: boolean };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly audit: AuditService,
    private readonly store: SessionStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Login local de respaldo, solo para el administrador (RF-04).
  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const found = await this.prisma.user.findUnique({
      where: { institutionalEmail: dto.email },
      include: { localCredential: true },
    });
    const credential = found?.localCredential;

    // Mismo mensaje y mismo tiempo para correo inexistente, sin credencial local o clave errada.
    if (!found || !credential || found.role !== 'ADMIN') {
      await this.passwords.verifyAgainstDummy(dto.password);
      await this.fail('auth.login_failed', undefined, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verify(credential.passwordHash, dto.password))) {
      await this.fail('auth.login_failed', found.id, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Solo se revela que la cuenta esta inactiva a quien ya acredito la clave (RF-08).
    if (found.status !== 'ACTIVE') {
      await this.fail('auth.login_blocked', found.id, ip);
      throw new ForbiddenException('Tu cuenta no esta activa. Contacta al administrador');
    }

    if (credential.totpSecretEncrypted) {
      if (!dto.totp) {
        throw new UnauthorizedException({
          message: 'Ingresa el codigo de verificacion',
          code: 'TOTP_REQUIRED',
        });
      }
      const secret = this.totp.decrypt(credential.totpSecretEncrypted);
      if (!this.totp.verify(secret, dto.totp)) {
        await this.fail('auth.login_failed', found.id, ip);
        throw new UnauthorizedException({
          message: 'Codigo de verificacion invalido',
          code: 'TOTP_INVALID',
        });
      }
    }

    await this.audit.record({ actorId: found.id, action: 'auth.login', module: 'auth', ip });
    return {
      user: { id: found.id, role: found.role },
      mustAcceptPolicy: await this.mustAcceptPolicy(found.id),
    };
  }

  async mustAcceptPolicy(userId: string): Promise<boolean> {
    const accepted = await this.prisma.policyAcceptance.findUnique({
      where: { userId_policyVersion: { userId, policyVersion: this.env.POLICY_VERSION } },
    });
    return !accepted;
  }

  // RF-07: queda registrada la version aceptada y la fecha.
  async acceptPolicy(userId: string, ip?: string): Promise<void> {
    await this.prisma.policyAcceptance.upsert({
      where: { userId_policyVersion: { userId, policyVersion: this.env.POLICY_VERSION } },
      create: { userId, policyVersion: this.env.POLICY_VERSION },
      update: {},
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.policy_accepted',
      module: 'auth',
      ip,
      afterState: { policyVersion: this.env.POLICY_VERSION },
    });
  }

  // Paso 1 del 2FA: el secreto queda pendiente en Redis y solo se guarda en la base al confirmar un codigo.
  async startTotpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    const secret = this.totp.newSecret();
    await this.store.set(this.setupKey(userId), secret, SETUP_TTL_SECONDS);
    return { secret, otpauthUrl: this.totp.otpauthUrl(user.institutionalEmail, secret) };
  }

  // Paso 2: se comprueba un codigo real antes de activar, para no dejar al admin sin acceso.
  async enableTotp(userId: string, code: string, ip?: string): Promise<void> {
    const secret = await this.store.get(this.setupKey(userId));
    if (!secret) {
      throw new BadRequestException('La configuracion del 2FA expiro. Inicia de nuevo');
    }
    if (!this.totp.verify(secret, code)) {
      throw new BadRequestException('Codigo de verificacion invalido');
    }
    await this.prisma.localCredential.update({
      where: { userId },
      data: { totpSecretEncrypted: this.totp.encrypt(secret) },
    });
    await this.store.del(this.setupKey(userId));
    await this.audit.record({ actorId: userId, action: 'auth.2fa_enabled', module: 'auth', ip });
  }

  private setupKey(userId: string): string {
    return `totp-setup:${userId}`;
  }

  private fail(action: string, actorId: string | undefined, ip?: string): Promise<void> {
    return this.audit.record({ actorId, action, module: 'auth', ip });
  }
}
