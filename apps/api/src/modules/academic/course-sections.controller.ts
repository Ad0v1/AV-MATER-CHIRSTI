import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { AcademicAccessService, type CourseSectionContext } from './academic-access.service.js';
import {
  assignTeacherSchema,
  createCourseSectionSchema,
  idSchema,
  updateCourseSectionSchema,
  type AssignTeacherDto,
  type CreateCourseSectionDto,
  type UpdateCourseSectionDto,
} from './academic.dto.js';
import { CourseSectionsService, type CourseSectionView } from './course-sections.service.js';
import { actorOf, currentUser, type RequestWithUser } from './request-user.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// RF-13/14. ADMIN a nivel de clase; /context lo abre a los 4 roles con pertenencia.
@Roles('ADMIN')
@Controller()
export class CourseSectionsController {
  constructor(
    private readonly courseSections: CourseSectionsService,
    private readonly access: AcademicAccessService,
  ) {}

  @Get('sections/:sectionId/course-sections')
  list(
    @Param('sectionId', new ZodValidationPipe(idSchema)) sectionId: string,
  ): Promise<{ items: CourseSectionView[]; total: number }> {
    return this.courseSections.listBySection(sectionId);
  }

  @Post('sections/:sectionId/course-sections')
  create(
    @Param('sectionId', new ZodValidationPipe(idSchema)) sectionId: string,
    @Body(new ZodValidationPipe(createCourseSectionSchema)) dto: CreateCourseSectionDto,
    @Req() req: RequestWithUser,
  ): Promise<CourseSectionView> {
    return this.courseSections.create(sectionId, dto, actorOf(req));
  }

  @Patch('course-sections/:id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateCourseSectionSchema)) dto: UpdateCourseSectionDto,
    @Req() req: RequestWithUser,
  ): Promise<CourseSectionView> {
    return this.courseSections.update(id, dto, actorOf(req));
  }

  @Put('course-sections/:id/teacher')
  assignTeacher(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(assignTeacherSchema)) dto: AssignTeacherDto,
    @Req() req: RequestWithUser,
  ): Promise<CourseSectionView> {
    return this.courseSections.assignTeacher(id, dto, actorOf(req));
  }

  // Contrato docs/03: contexto para cualquier miembro del curso-sección.
  @Get('course-sections/:id/context')
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'GUARDIAN')
  async context(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<CourseSectionContext> {
    await this.access.assertCanAccessCourseSection(currentUser(req), id);
    return this.access.getCourseSectionContext(id);
  }
}
