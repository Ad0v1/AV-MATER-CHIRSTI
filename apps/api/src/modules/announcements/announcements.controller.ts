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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { idSchema } from '../academic/academic.dto.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import {
  adminAnnouncementSchema,
  courseAnnouncementSchema,
  meAnnouncementsQuerySchema,
  pageQuerySchema,
  updateAnnouncementSchema,
  type AdminAnnouncementDto,
  type CourseAnnouncementDto,
  type MeAnnouncementsQuery,
  type PageQuery,
  type UpdateAnnouncementDto,
} from './announcements.dto.js';
import {
  AnnouncementsService,
  type AnnouncementPage,
  type AnnouncementView,
} from './announcements.service.js';

/** 30 escrituras de anuncios por minuto y usuario: cada publicación genera avisos y correos. */
export const ANNOUNCEMENT_WRITE_THROTTLE = {
  default: { limit: 30, ttl: 60_000, getTracker: trackByUser },
};

/** 5 publicaciones por minuto y usuario (cada una avisa a muchas personas; INFORME 17). */
export const ANNOUNCEMENT_CREATE_THROTTLE = {
  default: { limit: 5, ttl: 60_000, getTracker: trackByUser },
};

// RF-32: anuncios del curso. Docente asignado o ADMIN (el servicio comprueba la asignación).
@Roles('TEACHER', 'ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('course-sections/:id/announcements')
export class CourseSectionAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementPage> {
    return this.announcements.listForCourseSection(currentUser(req), id, query);
  }

  @Post()
  @Throttle(ANNOUNCEMENT_CREATE_THROTTLE)
  create(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(courseAnnouncementSchema)) dto: CourseAnnouncementDto,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementView> {
    return this.announcements.createForCourseSection(currentUser(req), actorOf(req), id, dto);
  }
}

// RF-32: anuncios de la institución o de un grado (ADMIN) y edición o retiro (autor o ADMIN).
@UseGuards(ActiveActorGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @Roles('ADMIN')
  list(
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementPage> {
    return this.announcements.listInstitutional(currentUser(req), query);
  }

  @Post()
  @Roles('ADMIN')
  @Throttle(ANNOUNCEMENT_CREATE_THROTTLE)
  create(
    @Body(new ZodValidationPipe(adminAnnouncementSchema)) dto: AdminAnnouncementDto,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementView> {
    return this.announcements.createInstitutional(currentUser(req), actorOf(req), dto);
  }

  @Patch(':id')
  @Roles('TEACHER', 'ADMIN')
  @Throttle(ANNOUNCEMENT_WRITE_THROTTLE)
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema)) dto: UpdateAnnouncementDto,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementView> {
    return this.announcements.update(currentUser(req), actorOf(req), id, dto);
  }

  @Delete(':id')
  @Roles('TEACHER', 'ADMIN')
  @HttpCode(204)
  @Throttle(ANNOUNCEMENT_WRITE_THROTTLE)
  remove(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.announcements.remove(currentUser(req), actorOf(req), id);
  }
}

// RF-32: bandeja de anuncios del usuario. ADMIN no tiene bandeja (403 por rol).
@Roles('STUDENT', 'TEACHER', 'GUARDIAN')
@UseGuards(ActiveActorGuard)
@Controller('me/announcements')
export class MeAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(meAnnouncementsQuerySchema)) query: MeAnnouncementsQuery,
    @Req() req: RequestWithUser,
  ): Promise<AnnouncementPage> {
    return this.announcements.listMine(currentUser(req), query);
  }
}
