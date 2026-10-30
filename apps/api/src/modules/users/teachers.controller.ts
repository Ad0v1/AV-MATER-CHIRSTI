import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import type { UserView } from './user-views.js';
import { createTeacherSchema, type CreateTeacherDto } from './users.dto.js';
import { UsersService } from './users.service.js';

// RF-19. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createTeacherSchema)) dto: CreateTeacherDto,
    @Req() req: RequestWithUser,
  ): Promise<UserView> {
    return this.users.createTeacher(dto, actorOf(req));
  }
}
