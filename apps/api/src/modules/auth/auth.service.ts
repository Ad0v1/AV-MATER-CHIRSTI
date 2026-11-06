import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser, UserRole } from '../../common/auth/roles.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SessionStore } from '../../common/session/session.store.js';
import { ENV, type Env } from '../../config/config.module.js';
import type { AcceptPolicyDto, ChangePasswordDto, LoginDto, UpdateProfileDto } from './auth.dto.js';
import { DniService } from './dni.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';
import { checkPasswordPolicy } from './password-policy.js';
import { PasswordService } from './password.service.js';
import { pendingFlags } from './setup-flags.js';
import { TotpService } from './totp.service.js';
import { isValidUserCode } from './user-code.js';

const INVALID_CREDENTIALS = 'Credenciales invalidas';
const SETUP_TTL_SECONDS = 10 * 60;

export type LoginResult = {
  user: AuthenticatedUser;
  mustAcceptPolicy: boolean;
  mustChangePassword: boolean;
  mustVerifyEmail: boolean;
  mustCompleteContact: boolean;
};

export type ProfileView = {
  code: string | null;
  fullName: string;
  role: UserRole;
  contactEmail: string | null;
  emailVerified: boolean;
  phone: string | null;
  address: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly totp: TotpService,
    private readonly audit: AuditService,
    private readonly store: SessionStore,
    private readonly attempts: LoginAttemptsService,
    private readonly dni: DniService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Inicio de sesion con codigo de usuario y contrasena, para todos los roles (RF-01, RF-02, D-058).
  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const code = dto.code;
    // Un codigo con el digito de control mal no existe: no se consulta ni se cuenta.
    const wellFormed = isValidUserCode(code);
    const locked = wellFormed && (await this.attempts.isLocked(code));

    const found =
      wellFormed && !locked
        ? await this.prisma.user.findUnique({
            where: { code },
            include: { localCredential: true },
          })
        : null;
    const credential = found?.localCredential;

    // Mismo mensaje y mismo tiempo para codigo inexistente, cuenta bloqueada, sin credencial o
    // clave errada: no se revela cual de ellos ocurrio (RF-75).
    if (!found || !credential) {
      await this.passwords.verifyAgainstDummy(dto.password);
      if (wellFormed && !locked) await this.failed(code, undefined, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verify(credential.passwordHash, dto.password))) {
      await this.failed(code, found.id, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Solo se revela que la cuenta esta inactiva a quien ya acredito la clave (RF-08).
    if (found.status !== 'ACTIVE') {
      await this.audit.record({
        actorId: found.id,
        action: 'auth.login_blocked',
        module: 'auth',
        ip,
      });
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
      if (!(await this.totp.verifyOnce(found.id, secret, dto.totp))) {
        await this.failed(code, found.id, ip);
        throw new UnauthorizedException({
          message: 'Codigo de verificacion invalido o ya utilizado',
          code: 'TOTP_INVALID',
        });
      }
    }

    await this.attempts.clear(code);
    await this.audit.record({ actorId: found.id, action: 'auth.login', module: 'auth', ip });
    const mustChangePassword = credential.mustChangePassword;
    const flags = pendingFlags(found);
    return {
      user: {
        id: found.id,
        role: found.role,
        ...(mustChangePassword ? { mustChangePassword: true as const } : {}),
        ...flags,
      },
      mustAcceptPolicy: await this.mustAcceptPolicy(found.id),
      mustChangePassword,
      mustVerifyEmail: flags.mustVerifyEmail === true,
      mustCompleteContact: flags.mustCompleteContact === true,
    };
  }

  // Pasos pendientes del usuario segun la base de datos. El controlador los usa al abrir una
  // sesion nueva despues de cambiar la contrasena, verificar el correo o completar el perfil.
  async pendingFlagsOf(userId: string): Promise<ReturnType<typeof pendingFlags>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    return pendingFlags(user);
  }

  // RF-83: el propio usuario ve y corrige su telefono y direccion. Solo el administrador los ve.
  async getProfile(userId: string): Promise<ProfileView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    return {
      code: user.code,
      fullName: user.fullName,
      role: user.role,
      contactEmail: user.contactEmail,
      emailVerified: user.emailVerifiedAt !== null,
      phone: user.phone,
      address: user.address,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    // El telefono del apoderado es obligatorio (RF-83): no se puede borrar.
    if (user.role === 'GUARDIAN' && dto.phone === null) {
      throw new BadRequestException({
        message: ['phone: el telefono del apoderado es obligatorio'],
      });
    }
    const data: { phone?: string | null; address?: string | null } = {};
    if (dto.phone !== undefined && dto.phone !== user.phone) data.phone = dto.phone;
    if (dto.address !== undefined && dto.address !== user.address) data.address = dto.address;
    const changedFields = Object.keys(data);
    if (changedFields.length === 0) return;
    await this.prisma.user.update({ where: { id: userId }, data });
    // Solo los nombres de los campos: nunca el telefono ni la direccion.
    await this.audit.record({
      actorId: userId,
      action: 'auth.profile_updated',
      module: 'auth',
      entityType: 'User',
      entityId: userId,
      ip,
      afterState: { changedFields },
    });
  }

  // Cambio de contrasena por el propio usuario (RF-72, RF-73). El cierre de las demas sesiones y
  // la sesion nueva los hace el controlador despues de este metodo (RF-78).
  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string): Promise<void> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { localCredential: true },
    });
    const credential = found?.localCredential;
    if (!found || !credential) throw new UnauthorizedException('Debes iniciar sesion');

    if (!(await this.passwords.verify(credential.passwordHash, dto.currentPassword))) {
      await this.audit.record({
        actorId: userId,
        action: 'auth.password_change_failed',
        module: 'auth',
        ip,
      });
      throw new BadRequestException({
        message: 'La contrasena actual no es correcta',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    const identity = [found.code, this.decryptDni(found.dniEncrypted)].filter(
      (v): v is string => typeof v === 'string',
    );
    const issues = checkPasswordPolicy(dto.newPassword, { identity });
    if (await this.passwords.verify(credential.passwordHash, dto.newPassword)) {
      issues.push('Debe ser distinta de la contraseña actual');
    }
    if (issues.length > 0) throw new BadRequestException({ message: issues });

    await this.prisma.localCredential.update({
      where: { userId },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.password_changed',
      module: 'auth',
      ip,
    });
  }

  async mustAcceptPolicy(userId: string): Promise<boolean> {
    const accepted = await this.prisma.policyAcceptance.findUnique({
      where: { userId_policyVersion: { userId, policyVersion: this.env.POLICY_VERSION } },
    });
    return !accepted;
  }

  // RF-07: queda registrada la version aceptada y la fecha. Las dos casillas son obligatorias;
  // el apoderado marca ademas que acepta en nombre de los alumnos vinculados a el.
  async acceptPolicy(
    userId: string,
    role: UserRole,
    dto: AcceptPolicyDto,
    ip?: string,
  ): Promise<void> {
    const onBehalfOfWards = role === 'GUARDIAN';
    if (onBehalfOfWards && dto.onBehalfOfWards !== true) {
      throw new BadRequestException({
        message: ['onBehalfOfWards: debes aceptar en nombre de los alumnos vinculados a ti'],
      });
    }
    await this.prisma.policyAcceptance.upsert({
      where: { userId_policyVersion: { userId, policyVersion: this.env.POLICY_VERSION } },
      create: { userId, policyVersion: this.env.POLICY_VERSION, onBehalfOfWards },
      update: {},
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.policy_accepted',
      module: 'auth',
      ip,
      afterState: { policyVersion: this.env.POLICY_VERSION, onBehalfOfWards },
    });
  }

  // Paso 1 del 2FA: el secreto queda pendiente en Redis y solo se guarda en la base al confirmar un codigo.
  async startTotpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Debes iniciar sesion');
    const secret = this.totp.newSecret();
    await this.store.set(this.setupKey(userId), secret, SETUP_TTL_SECONDS);
    // La etiqueta de la app autenticadora es el codigo de usuario: el correo ya no es la identidad.
    return {
      secret,
      otpauthUrl: this.totp.otpauthUrl(user.code ?? user.id, secret),
    };
  }

  // Paso 2: se comprueba un codigo real antes de activar, para no dejar al admin sin acceso.
  async enableTotp(userId: string, code: string, ip?: string): Promise<void> {
    const secret = await this.store.get(this.setupKey(userId));
    if (!secret) {
      throw new BadRequestException('La configuracion del 2FA expiro. Inicia de nuevo');
    }
    if (!(await this.totp.verifyOnce(userId, secret, code))) {
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

  // Registra el fallo, lo cuenta para el bloqueo temporal y deja constancia si este lo provoca.
  private async failed(code: string, actorId: string | undefined, ip?: string): Promise<void> {
    await this.audit.record({ actorId, action: 'auth.login_failed', module: 'auth', ip });
    if (await this.attempts.registerFailure(code)) {
      await this.audit.record({
        actorId,
        action: 'auth.account_locked',
        module: 'auth',
        ip,
        afterState: { lockSeconds: this.env.LOGIN_LOCK_SECONDS },
      });
    }
  }

  private decryptDni(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
      return this.dni.decrypt(encrypted);
    } catch {
      return null;
    }
  }
}
