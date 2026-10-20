import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../../common/audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/auth/roles.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../common/session/session-cookie.js';
import { SessionService } from '../../common/session/session.service.js';
import { ENV, type Env } from '../../config/config.module.js';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Contrato docs/03: usuario autenticado, rol y estado. Hoy solo id y rol.
  @Get('me')
  me(@Req() req: RequestWithUser): AuthenticatedUser {
    if (!req.user) throw new UnauthorizedException('Debes iniciar sesion');
    return req.user;
  }

  @Post('logout')
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
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(
      this.env.NODE_ENV === 'production',
      this.sessions.ttlSeconds,
    );
    res.clearCookie(SESSION_COOKIE, options);
  }
}
