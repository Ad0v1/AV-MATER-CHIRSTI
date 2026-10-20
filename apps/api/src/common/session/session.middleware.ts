import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/roles.js';
import { SESSION_COOKIE } from './session-cookie.js';
import { SessionService } from './session.service.js';

type RequestWithUser = Request & { user?: AuthenticatedUser };

// Llena `request.user` si la cookie trae una sesion valida. No rechaza nada:
// de eso se encarga RolesGuard segun @Roles.
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  async use(req: RequestWithUser, _res: Response, next: NextFunction): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (token) {
      const user = await this.sessions.resolve(token);
      if (user) req.user = user;
    }
    next();
  }
}
