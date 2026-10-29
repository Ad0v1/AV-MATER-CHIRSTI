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
} from '@nestjs/common';
import { Roles } from '../../common/auth/roles.decorator.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { idSchema } from './assignments.dto.js';
import {
  createMaterialSchema,
  listMaterialsQuerySchema,
  updateMaterialSchema,
  type CreateMaterialDto,
  type ListMaterialsQuery,
  type UpdateMaterialDto,
} from './materials.dto.js';
import { MaterialsService, type MaterialView } from './materials.service.js';

// RF-26/27/29/30/31. Leen los miembros (docente asignado, estudiante con matrícula vigente y
// ADMIN); el apoderado no ve materiales (403 por rol, decisión 4 del usuario). Escriben el
// docente asignado y ADMIN (lo comprueba el servicio).
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller()
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get('course-sections/:id/materials')
  list(
    @Param('id', new ZodValidationPipe(idSchema)) courseSectionId: string,
    @Query(new ZodValidationPipe(listMaterialsQuerySchema)) query: ListMaterialsQuery,
    @Req() req: RequestWithUser,
  ): Promise<{ items: MaterialView[]; total: number }> {
    return this.materials.list(courseSectionId, query, currentUser(req));
  }

  @Post('course-sections/:id/materials')
  @Roles('ADMIN', 'TEACHER')
  create(
    @Param('id', new ZodValidationPipe(idSchema)) courseSectionId: string,
    @Body(new ZodValidationPipe(createMaterialSchema)) dto: CreateMaterialDto,
    @Req() req: RequestWithUser,
  ): Promise<MaterialView> {
    return this.materials.create(courseSectionId, dto, currentUser(req), actorOf(req));
  }

  @Patch('materials/:id')
  @Roles('ADMIN', 'TEACHER')
  update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(updateMaterialSchema)) dto: UpdateMaterialDto,
    @Req() req: RequestWithUser,
  ): Promise<MaterialView> {
    return this.materials.update(id, dto, currentUser(req), actorOf(req));
  }

  @Delete('materials/:id')
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(204)
  remove(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    return this.materials.remove(id, currentUser(req), actorOf(req));
  }

  @Post('materials/:id/restore')
  @Roles('ADMIN', 'TEACHER')
  @HttpCode(200)
  restore(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<MaterialView> {
    return this.materials.restore(id, currentUser(req), actorOf(req));
  }
}
