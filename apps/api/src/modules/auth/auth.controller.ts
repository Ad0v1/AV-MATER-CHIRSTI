import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../../common/audit/audit.service.js';
import {
  AllowPendingEmailVerification,
  AllowPendingPasswordChange,
} from '../../common/auth/pending-setup.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import type { AuthenticatedUser, UserRole } from '../../common/auth/roles.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../common/session/session-cookie.js';
import { SessionService } from '../../common/session/session.service.js';
import { ENV, type Env } from '../../config/config.module.js';
import {
  acceptPolicySchema,
  changePasswordSchema,
  loginSchema,
  manualEmailSchema,
  parseBody,
  recoverConfirmSchema,
  recoverRequestSchema,
  startEmailSchema,
  totpCodeSchema,
  userIdSchema,
  verifyEmailSchema,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordRecoveryService } from './password-recovery.service.js';

type RequestWithUser = Request & { user?: AuthenticatedUser };

type SessionInfo = {
  id: string;
  role: UserRole;
  mustAcceptPolicy: boolean;
  mustChangePassword: boolean;
  mustVerifyEmail: boolean;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emails: EmailVerificationService,
    private readonly recovery: PasswordRecoveryService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Limite estricto contra fuerza bruta (RNF-08): 5 intentos por minuto y por IP.
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionInfo> {
    const { user, mustAcceptPolicy, mustChangePassword, mustVerifyEmail } = await this.auth.login(
      parseBody(loginSchema, body),
      req.ip,
    );
    const token = await this.sessions.create(user);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { id: user.id, role: user.role, mustAcceptPolicy, mustChangePassword, mustVerifyEmail };
  }

  // Contrato docs/03: usuario autenticado y rol, mas los pasos del primer ingreso que le faltan.
  @Get('me')
  @AllowPendingPasswordChange()
  async me(@Req() req: RequestWithUser): Promise<SessionInfo> {
    const user = this.requireUser(req);
    return {
      id: user.id,
      role: user.role,
      mustAcceptPolicy: await this.auth.mustAcceptPolicy(user.id),
      mustChangePassword: user.mustChangePassword === true,
      mustVerifyEmail: user.mustVerifyEmail === true,
    };
  }

  // RF-72: cambio de contrasena. Cierra las demas sesiones del usuario (RF-78) y deja la actual
  // abierta con un token nuevo. Limite estricto: exige la contrasena actual.
  @Post('password')
  @AllowPendingPasswordChange()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @Body() body: unknown,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = this.requireUser(req);
    await this.auth.changePassword(user.id, parseBody(changePasswordSchema, body), req.ip);
    await this.sessions.revokeAll(user.id);
    // El cambio de contrasena no cumple el paso del correo: si aun falta, la sesion nueva lo conserva.
    const token = await this.sessions.create({
      id: user.id,
      role: user.role,
      ...(user.mustVerifyEmail ? { mustVerifyEmail: true as const } : {}),
    });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  // RF-07: las dos casillas son obligatorias. Es parte del primer ingreso: se puede hacer antes
  // de verificar el correo.
  @Post('policy/accept')
  @AllowPendingEmailVerification()
  @HttpCode(204)
  async acceptPolicy(@Body() body: unknown, @Req() req: RequestWithUser): Promise<void> {
    const user = this.requireUser(req);
    await this.auth.acceptPolicy(user.id, user.role, parseBody(acceptPolicySchema, body), req.ip);
  }

  // RF-80: envia un codigo al correo indicado. RF-81: `guardian` marca que es el de su apoderado.
  @Post('email/start')
  @AllowPendingEmailVerification()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async startEmail(@Body() body: unknown, @Req() req: RequestWithUser): Promise<void> {
    const user = this.requireUser(req);
    const dto = parseBody(startEmailSchema, body);
    await this.emails.start(user.id, dto.email, dto.guardian === true, req.ip);
  }

  // Confirma el codigo, guarda el correo y abre una sesion nueva sin el paso pendiente.
  @Post('email/verify')
  @AllowPendingEmailVerification()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(
    @Body() body: unknown,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const user = this.requireUser(req);
    await this.emails.verify(user.id, parseBody(verifyEmailSchema, body).code, req.ip);
    await this.sessions.revokeAll(user.id);
    const token = await this.sessions.create({ id: user.id, role: user.role });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  // RF-82: pide un codigo de recuperacion. Siempre responde 204, exista o no el usuario.
  @Post('recover/request')
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestRecovery(@Body() body: unknown, @Req() req: Request): Promise<void> {
    await this.recovery.request(parseBody(recoverRequestSchema, body).code, req.ip);
  }

  @Post('recover/confirm')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async confirmRecovery(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const dto = parseBody(recoverConfirmSchema, body);
    const { userId } = await this.recovery.confirm(
      dto.code,
      dto.emailCode,
      dto.newPassword,
      req.ip,
    );
    // Una contrasena nueva cierra todas las sesiones abiertas (RF-78).
    await this.sessions.revokeAll(userId);
  }

  // RF-88: el administrador marca un correo como verificado si el envio falla.
  @Post('users/:id/email/manual-verification')
  @Roles('ADMIN')
  @HttpCode(204)
  async verifyEmailManually(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const admin = this.requireUser(req);
    const { id } = parseBody(userIdSchema, params);
    const dto = parseBody(manualEmailSchema, body);
    await this.emails.verifyManually(admin.id, id, dto.email, dto.reason, req.ip);
    // Sus sesiones abiertas aun tienen el paso pendiente: se cierran para que entre de nuevo.
    await this.sessions.revokeAll(id);
  }

  @Post('2fa/setup')
  @Roles('ADMIN')
  setupTotp(@Req() req: RequestWithUser): Promise<{ secret: string; otpauthUrl: string }> {
    return this.auth.startTotpSetup(this.requireUser(req).id);
  }

  @Post('2fa/enable')
  @Roles('ADMIN')
  @HttpCode(204)
  async enableTotp(@Body() body: unknown, @Req() req: RequestWithUser): Promise<void> {
    const { code } = parseBody(totpCodeSchema, body);
    await this.auth.enableTotp(this.requireUser(req).id, code, req.ip);
  }

  @Post('logout')
  @AllowPendingPasswordChange()
  @HttpCode(204)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (token) await this.sessions.destroy(token);
    if (req.user) {
      await this.audit.record({
        actorId: req.user.id,
        action: 'auth.logout',
        module: 'auth',
        ip: req.ip,
      });
    }
    const { maxAge: _maxAge, ...options } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
  }

  private cookieOptions() {
    return sessionCookieOptions(this.env.NODE_ENV === 'production', this.sessions.ttlSeconds);
  }

  private requireUser(req: RequestWithUser): AuthenticatedUser {
    if (!req.user) throw new UnauthorizedException('Debes iniciar sesion');
    return req.user;
  }
}
