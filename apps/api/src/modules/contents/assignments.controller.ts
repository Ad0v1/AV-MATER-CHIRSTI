import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import {
  createAssignmentSchema,
  idSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
  type CreateAssignmentDto,
  type ListAssignmentsQuery,
  type UpdateAssignmentDto,
} from './assignments.dto.js';
import { AssignmentsService, type AssignmentView } from './assignments.service.js';

// RF-28/29. Leen los miembros (docente asignado, estudiante con matrícula vigente y ADMIN);
// el apoderado no (403 por rol). Escriben el docente asignado y ADMIN (lo comprueba el servicio).
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('course-sections/:id/assignments')
  @Roles('ADMIN', 'TEACHER')
  create(
    @Param('id', new ZodValidationPipe(idSchema)) courseSectionId: string,
    @Body(new ZodValidationPipe(createAssignmentSchema)) dto: CreateAssignmentDto,
    @Req() req: RequestWithUser,
  ): Promise<AssignmentView> {
    return this.assignments.create(courseSectionId, dto, currentUser(req), actorOf(req));
  }

  @Get('course-sections/:id/assignments')
  list(
    @Param('id', new ZodValidationPipe(idSchema)) courseSectionId: string,
    @Query(new ZodValidationPipe(listAssignmentsQuerySchema)) query: ListAssignmentsQuery,
    @Req() req: RequestWithUser,
  ): Promise<{ items: AssignmentView[]; total: number }> {
    return this.assignments.list(courseSectionId, query, currentUser(req));
  }

  @Get('assignments/:id')
  get(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<AssignmentView> {
    return this.assignments.get(id, currentUser(req));
  }

  @Patch('assignments/:id')
  @Roles('ADMIN', 'TEACHER')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) dto: UpdateAssignmentDto,
    @Req() req: RequestWithUser,
  ): Promise<AssignmentView> {
    return this.assignments.update(id, dto, currentUser(req), actorOf(req));
  }

  @Delete('assignments/:id')
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(204)
  remove(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.assignments.remove(id, currentUser(req), actorOf(req));
  }
}
