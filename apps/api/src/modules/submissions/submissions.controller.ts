import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { idSchema, submitSchema, type SubmitDto } from './submissions.dto.js';
import { SubmissionsService } from './submissions.service.js';
import type {
  MySubmissionView,
  SubmissionAccepted,
  SubmissionVersionsView,
  TeacherSubmissionItem,
} from './submissions.types.js';

// RF-33/36..39. El apoderado no entra a ninguna ruta (403 por rol): sus estados visibles
// (RF-52) son de Dev 4.
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  // 201 con una versión nueva; 200 si ese fileId ya estaba entregado (idempotente).
  @Post('assignments/:id/submissions')
  @Roles('STUDENT')
  async submit(
    @Param('id', new ZodValidationPipe(idSchema)) assignmentId: string,
    @Body(new ZodValidationPipe(submitSchema)) dto: SubmitDto,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SubmissionAccepted> {
    const { created, body } = await this.submissions.submit(
      assignmentId,
      dto.fileId,
      currentUser(req),
      actorOf(req),
    );
    res.status(created ? 201 : 200);
    return body;
  }

  @Get('assignments/:id/submissions/me')
  @Roles('STUDENT')
  mine(
    @Param('id', new ZodValidationPipe(idSchema)) assignmentId: string,
    @Req() req: RequestWithUser,
  ): Promise<MySubmissionView> {
    return this.submissions.mine(assignmentId, currentUser(req));
  }

  @Get('assignments/:id/submissions')
  @Roles('TEACHER', 'ADMIN')
  list(
    @Param('id', new ZodValidationPipe(idSchema)) assignmentId: string,
    @Req() req: RequestWithUser,
  ): Promise<{ items: TeacherSubmissionItem[]; total: number }> {
    return this.submissions.listForTeacher(assignmentId, currentUser(req));
  }

  @Get('submissions/:id/versions')
  @Roles('STUDENT', 'TEACHER', 'ADMIN')
  versions(
    @Param('id', new ZodValidationPipe(idSchema)) submissionId: string,
    @Req() req: RequestWithUser,
  ): Promise<SubmissionVersionsView> {
    return this.submissions.versions(submissionId, currentUser(req));
  }
}
