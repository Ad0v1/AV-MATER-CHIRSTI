import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from './active-actor.guard.js';
import { EnrollmentsService, type TransferResult } from './enrollments.service.js';
import { GuardianLinksService, type LinkList } from './guardian-links.service.js';
import type { EnrollmentView, UserView } from './user-views.js';
import {
  createStudentSchema,
  enrollSchema,
  idSchema,
  listEnrollmentsQuerySchema,
  listLinksQuerySchema,
  transferSchema,
  type CreateStudentDto,
  type EnrollDto,
  type ListEnrollmentsQuery,
  type ListLinksQuery,
  type TransferDto,
} from './users.dto.js';

// RF-18, RF-24 y consultas del estudiante. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly links: GuardianLinksService,
  ) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createStudentSchema)) dto: CreateStudentDto,
    @Req() req: RequestWithUser,
  ): Promise<{ user: UserView; enrollment: EnrollmentView }> {
    return this.enrollments.createStudent(dto, actorOf(req));
  }

  @Post(':id/enrollments')
  enroll(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(enrollSchema)) dto: EnrollDto,
    @Req() req: RequestWithUser,
  ): Promise<EnrollmentView> {
    return this.enrollments.enroll(id, dto, actorOf(req));
  }

  @Post(':id/transfer')
  @HttpCode(200)
  transfer(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(transferSchema)) dto: TransferDto,
    @Req() req: RequestWithUser,
  ): Promise<TransferResult> {
    return this.enrollments.transfer(id, dto, actorOf(req));
  }

  @Get(':id/enrollments')
  listEnrollments(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(listEnrollmentsQuerySchema)) query: ListEnrollmentsQuery,
  ): Promise<{ items: EnrollmentView[]; total: number }> {
    return this.enrollments.listForStudent(id, query);
  }

  @Get(':id/guardians')
  listGuardians(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(listLinksQuerySchema)) query: ListLinksQuery,
  ): Promise<LinkList> {
    return this.links.listForStudent(id, query);
  }
}
