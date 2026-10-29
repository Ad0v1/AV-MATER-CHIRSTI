import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  createCourseSchema,
  idSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
  type CreateCourseDto,
  type ListCoursesQuery,
  type UpdateCourseDto,
} from './academic.dto.js';
import { CoursesService, type CourseView } from './courses.service.js';
import { actorOf, type RequestWithUser } from './request-user.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// RF-13: catálogo global. Solo ADMIN.
@Roles('ADMIN')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listCoursesQuerySchema)) query: ListCoursesQuery,
  ): Promise<{ items: CourseView[]; total: number }> {
    return this.courses.list(query.includeInactive);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCourseSchema)) dto: CreateCourseDto,
    @Req() req: RequestWithUser,
  ): Promise<CourseView> {
    return this.courses.create(dto, actorOf(req));
  }

  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateCourseSchema)) dto: UpdateCourseDto,
    @Req() req: RequestWithUser,
  ): Promise<CourseView> {
    return this.courses.update(id, dto, actorOf(req));
  }
}
