import { Body, Controller, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import type { PeriodView } from './academic-access.service.js';
import {
  closePeriodSchema,
  idSchema,
  reopenPeriodSchema,
  updatePeriodSchema,
  type ClosePeriodDto,
  type ReopenPeriodDto,
  type UpdatePeriodDto,
} from './academic.dto.js';
import { AcademicPeriodsService } from './academic-periods.service.js';
import { actorOf, type RequestWithUser } from './request-user.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// RF-10, RF-11, RN-10. Solo ADMIN.
@Roles('ADMIN')
@Controller('academic-periods')
export class AcademicPeriodsController {
  constructor(private readonly periods: AcademicPeriodsService) {}

  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updatePeriodSchema)) dto: UpdatePeriodDto,
    @Req() req: RequestWithUser,
  ): Promise<PeriodView> {
    return this.periods.update(id, dto, actorOf(req));
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(closePeriodSchema)) dto: ClosePeriodDto,
    @Req() req: RequestWithUser,
  ): Promise<PeriodView> {
    return this.periods.close(id, dto, actorOf(req));
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(reopenPeriodSchema)) dto: ReopenPeriodDto,
    @Req() req: RequestWithUser,
  ): Promise<PeriodView> {
    return this.periods.reopen(id, dto, actorOf(req));
  }
}
