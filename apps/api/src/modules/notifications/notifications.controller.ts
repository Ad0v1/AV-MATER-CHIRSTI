import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { USER_ROLES } from '../../common/auth/roles.js';
import { idSchema } from '../academic/academic.dto.js';
import { currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import { notificationsQuerySchema, type NotificationsQuery } from './notifications.dto.js';
import { NotificationsService, type NotificationPage } from './notifications.service.js';

/** 60 marcas por minuto y usuario (la campana marca de a una). */
const READ_THROTTLE = { default: { limit: 60, ttl: 60_000, getTracker: trackByUser } };

// RF-53: bandeja de avisos de la sesión. Cualquier rol con sesión y ACTIVE; nunca se recibe el id
// de otra persona: el destinatario siempre es el usuario de la sesión.
@Roles(...USER_ROLES)
@UseGuards(ActiveActorGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(notificationsQuerySchema)) query: NotificationsQuery,
    @Req() req: RequestWithUser,
  ): Promise<NotificationPage> {
    return this.notifications.list(currentUser(req), query);
  }

  // Ruta fija antes que la de :id para que "read-all" no se tome como id.
  @Post('read-all')
  @HttpCode(200)
  @Throttle(READ_THROTTLE)
  readAll(@Req() req: RequestWithUser): Promise<{ updated: number }> {
    return this.notifications.markAllRead(currentUser(req));
  }

  @Post(':id/read')
  @HttpCode(204)
  @Throttle(READ_THROTTLE)
  read(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.notifications.markRead(currentUser(req), id);
  }
}
