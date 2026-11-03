import { Body, Controller, Get, Param, Patch, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import type { UserView } from './user-views.js';
import {
  changeStatusSchema,
  idSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type ChangeStatusDto,
  type ListUsersQuery,
  type UpdateUserDto,
} from './users.dto.js';
import {
  UsersService,
  type StatusChangeResult,
  type UserDetail,
  type UserListPage,
} from './users.service.js';

// RF-22, RF-23, RF-25. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<UserListPage> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<UserDetail> {
    return this.users.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ): Promise<UserView> {
    return this.users.update(id, dto, actorOf(req));
  }

  @Put(':id/status')
  changeStatus(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) dto: ChangeStatusDto,
    @Req() req: RequestWithUser,
  ): Promise<StatusChangeResult> {
    return this.users.changeStatus(id, dto, actorOf(req));
  }
}
