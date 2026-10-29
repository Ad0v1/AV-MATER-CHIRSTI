import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import { GuardianLinksService, type LinkList } from './guardian-links.service.js';
import type { GuardianLinkView, UserView } from './user-views.js';
import {
  createGuardianSchema,
  idSchema,
  linkStudentSchema,
  listLinksQuerySchema,
  type CreateGuardianDto,
  type LinkStudentDto,
  type ListLinksQuery,
} from './users.dto.js';

// RF-20 y vínculos apoderado–estudiante. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly links: GuardianLinksService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createGuardianSchema)) dto: CreateGuardianDto,
    @Req() req: RequestWithUser,
  ): Promise<{ user: UserView; links: GuardianLinkView[] }> {
    return this.links.createGuardian(dto, actorOf(req));
  }

  @Get(':id/students')
  listStudents(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(listLinksQuerySchema)) query: ListLinksQuery,
  ): Promise<LinkList> {
    return this.links.listForGuardian(id, query);
  }

  @Post(':id/students')
  link(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(linkStudentSchema)) dto: LinkStudentDto,
    @Req() req: RequestWithUser,
  ): Promise<GuardianLinkView> {
    return this.links.link(id, dto, actorOf(req));
  }
}
