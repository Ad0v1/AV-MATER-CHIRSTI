import { Controller, Get, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { CourseSectionsService, type MyCourseSection } from './course-sections.service.js';
import { currentUser, type RequestWithUser } from './request-user.js';

// Contrato docs/03: cursos accesibles del usuario en el año activo. GUARDIAN y ADMIN → 403.
@Roles('TEACHER', 'STUDENT')
@Controller('me/course-sections')
export class MeCourseSectionsController {
  constructor(private readonly courseSections: CourseSectionsService) {}

  @Get()
  list(@Req() req: RequestWithUser): Promise<{ items: MyCourseSection[]; total: number }> {
    return this.courseSections.listMine(currentUser(req));
  }
}
