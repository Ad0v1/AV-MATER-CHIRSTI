import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../../common/audit/audit.service.js';
import { AllowPendingPasswordChange } from '../../common/auth/password-change.guard.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import type { AuthenticatedUser, UserRole } from '../../common/auth/roles.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../common/session/session-cookie.js';
import { SessionService } from '../../common/session/session.service.js';
import { ENV, type Env } from '../../config/config.module.js';
import { changePasswordSchema, loginSchema, parseBody, totpCodeSchema } from './auth.dto.js';
import { AuthService } from './auth.service.js';

type RequestWithUser = Request & { user?: AuthenticatedUser };

type SessionInfo = {
  id: string;
  role: UserRole;
  mustAcceptPolicy: boolean;
  mustChangePassword: boolean;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
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
    const { user, mustAcceptPolicy, mustChangePassword } = await this.auth.login(
      parseBody(loginSchema, body),
      req.ip,
    );
    const token = await this.sessions.create(user);
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
    return { id: user.id, role: user.role, mustAcceptPolicy, mustChangePassword };
  }

  // Contrato docs/03: usuario autenticado y rol, mas si debe aceptar la politica vigente y si
  // debe cambiar su contrasena.
  @Get('me')
  @AllowPendingPasswordChange()
  async me(@Req() req: RequestWithUser): Promise<SessionInfo> {
    const user = this.requireUser(req);
    return {
      id: user.id,
      role: user.role,
      mustAcceptPolicy: await this.auth.mustAcceptPolicy(user.id),
      mustChangePassword: user.mustChangePassword === true,
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
    const token = await this.sessions.create({ id: user.id, role: user.role });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  @Post('policy/accept')
  @HttpCode(204)
  async acceptPolicy(@Req() req: RequestWithUser): Promise<void> {
    await this.auth.acceptPolicy(this.requireUser(req).id, req.ip);
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
