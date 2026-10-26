import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  createYearSchema,
  idSchema,
  updateYearSchema,
  type CreateYearDto,
  type UpdateYearDto,
} from './academic.dto.js';
import {
  AcademicYearsService,
  type YearDetail,
  type YearSummary,
} from './academic-years.service.js';
import { actorOf, type RequestWithUser } from './request-user.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

// RF-09, RF-17, RN-11. Solo ADMIN.
@Roles('ADMIN')
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  list(): Promise<{ items: YearSummary[]; total: number }> {
    return this.years.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createYearSchema)) dto: CreateYearDto,
    @Req() req: RequestWithUser,
  ): Promise<YearDetail> {
    return this.years.create(dto, actorOf(req));
  }

  @Get(':id')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<YearDetail> {
    return this.years.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateYearSchema)) dto: UpdateYearDto,
    @Req() req: RequestWithUser,
  ): Promise<YearDetail> {
    return this.years.update(id, dto, actorOf(req));
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<YearDetail> {
    return this.years.activate(id, actorOf(req));
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<YearDetail> {
    return this.years.close(id, actorOf(req));
  }
}
