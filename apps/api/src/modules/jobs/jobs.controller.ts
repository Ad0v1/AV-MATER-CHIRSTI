import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { idSchema } from '../academic/academic.dto.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import type { SignedUrl } from '../storage/index.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import { JobDownloadService } from './job-download.service.js';
import type { JobView } from './jobs.types.js';

/** 30 URL por minuto y usuario: cada una deja bitácora. */
const DOWNLOAD_THROTTLE = { default: { limit: 30, ttl: 60_000, getTracker: trackByUser } };

// Estado y descarga de trabajos en segundo plano para las pantallas de administración (RNF-19,
// RF-63, RF-65). Solo ADMIN activo. Otro rol que pida el id de un trabajo recibe 403 por el rol;
// la regla del solicitante (404 JOB_NOT_FOUND) queda en BackgroundJobService para 5f.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly jobs: JobDownloadService) {}

  @Get(':id')
  get(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<JobView> {
    return this.jobs.find(id, currentUser(req));
  }

  @Post(':id/download-url')
  @HttpCode(200)
  @Throttle(DOWNLOAD_THROTTLE)
  downloadUrl(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<SignedUrl> {
    const user = currentUser(req);
    return this.jobs.downloadUrl(id, { ...actorOf(req), role: user.role });
  }
}
