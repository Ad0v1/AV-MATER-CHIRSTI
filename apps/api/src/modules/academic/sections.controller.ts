import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  createSectionSchema,
  idSchema,
  updateSectionSchema,
  type CreateSectionDto,
  type UpdateSectionDto,
} from './academic.dto.js';
import { SectionsService, type SectionView } from './sections.service.js';
import { actorOf, type RequestWithUser } from './request-user.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// RF-12. Solo ADMIN.
@Roles('ADMIN')
@Controller()
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get('academic-years/:yearId/sections')
  list(
    @Param('yearId', new ZodValidationPipe(idSchema)) yearId: string,
  ): Promise<{ items: SectionView[]; total: number }> {
    return this.sections.list(yearId);
  }

  @Post('academic-years/:yearId/sections')
  create(
    @Param('yearId', new ZodValidationPipe(idSchema)) yearId: string,
    @Body(new ZodValidationPipe(createSectionSchema)) dto: CreateSectionDto,
    @Req() req: RequestWithUser,
  ): Promise<SectionView> {
    return this.sections.create(yearId, dto, actorOf(req));
  }

  @Patch('sections/:id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateSectionSchema)) dto: UpdateSectionDto,
    @Req() req: RequestWithUser,
  ): Promise<SectionView> {
    return this.sections.update(id, dto, actorOf(req));
  }
}
