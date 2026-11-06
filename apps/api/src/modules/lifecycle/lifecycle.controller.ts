import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator.js';
import { idSchema } from '../academic/academic.dto.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import type { JobView } from '../jobs/index.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import {
  LifecycleService,
  type StorageUsageView,
  type YearBackupsView,
} from './lifecycle.service.js';

const usageQuerySchema = z.object({ academicYearId: z.uuid().optional() }).strict();

/** 10 solicitudes por minuto y ADMIN (además del límite de 3 trabajos activos, JOB_LIMIT). */
const EXPORT_THROTTLE = { default: { limit: 10, ttl: 60_000, getTracker: trackByUser } };

// Ciclo de vida (Dev 5): datos personales (RF-63), respaldos (RF-65) y uso del almacenamiento
// (RF-67). Solo ADMIN activo. La purga (RF-66) no tiene endpoint: la encola el barrido diario
// cuando el año cumple U7, y el plazo se cambia en la configuración (RF-61).
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('admin')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post('students/:id/personal-data-export')
  @HttpCode(202)
  @Throttle(EXPORT_THROTTLE)
  requestExport(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<JobView> {
    return this.lifecycle.requestPersonalDataExport(id, actorOf(req));
  }

  @Get('storage-usage')
  usage(
    @Query(new ZodValidationPipe(usageQuerySchema)) query: z.output<typeof usageQuerySchema>,
  ): Promise<StorageUsageView> {
    return this.lifecycle.storageUsage(query.academicYearId);
  }

  @Get('academic-years/:id/backups')
  backups(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<YearBackupsView> {
    return this.lifecycle.listBackups(id);
  }
}
