import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import { GuardianLinksService } from './guardian-links.service.js';
import type { GuardianLinkView } from './user-views.js';
import { idSchema, revokeLinkSchema, type RevokeLinkDto } from './users.dto.js';

// RN-13: revocación auditable del vínculo. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('guardian-links')
export class GuardianLinksController {
  constructor(private readonly links: GuardianLinksService) {}

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(revokeLinkSchema)) dto: RevokeLinkDto,
    @Req() req: RequestWithUser,
  ): Promise<GuardianLinkView> {
    return this.links.revoke(id, dto, actorOf(req));
  }
}
