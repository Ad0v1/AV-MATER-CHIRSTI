import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import {
  type CourseSectionsQuery,
  courseSectionsQuerySchema,
  type DashboardQuery,
  dashboardQuerySchema,
  type ExportRequest,
  exportRequestSchema,
} from './reports.dto.js';
import {
  type ExportAccepted,
  type ReportCourseSectionsView,
  type ReportsDashboardView,
  ReportsService,
} from './reports.service.js';

/** 10 solicitudes por minuto y ADMIN (además del límite de 3 trabajos activos, JOB_LIMIT). */
const EXPORT_THROTTLE = { default: { limit: 10, ttl: 60_000, getTracker: trackByUser } };
/** El dashboard recorre todo el año (o un grado): 5 por minuto y ADMIN (seguridad 5f). */
const DASHBOARD_THROTTLE = { default: { limit: 5, ttl: 60_000, getTracker: trackByUser } };

// Reportes institucionales (Dev 5, RF-57..60). Solo ADMIN activo (docs/05: "Ver bitácora y
// exportaciones"). El registro de un curso-sección (RF-57) se ve con el endpoint de Dev 4
// GET /course-sections/:id/gradebook, que ya admite ADMIN; aquí va el listado para elegirlo.
// Estado y descarga de los trabajos: GET /admin/jobs/:id y POST /admin/jobs/:id/download-url.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/course-sections')
  courseSections(
    @Query(new ZodValidationPipe(courseSectionsQuerySchema)) query: CourseSectionsQuery,
  ): Promise<ReportCourseSectionsView> {
    return this.reports.courseSections(query);
  }

  @Get('reports/dashboard')
  @Throttle(DASHBOARD_THROTTLE)
  dashboard(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<ReportsDashboardView> {
    return this.reports.dashboard(query);
  }

  @Post('exports')
  @HttpCode(202)
  @Throttle(EXPORT_THROTTLE)
  requestExport(
    @Body(new ZodValidationPipe(exportRequestSchema)) body: ExportRequest,
    @Req() req: RequestWithUser,
  ): Promise<ExportAccepted> {
    return this.reports.requestExport(body, actorOf(req));
  }
}
