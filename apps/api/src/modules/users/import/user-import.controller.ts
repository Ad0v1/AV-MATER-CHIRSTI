import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../../academic/request-user.js';
import { ZodValidationPipe } from '../../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from '../active-actor.guard.js';
import type { UploadedImportFile } from './import-file.js';
import {
  commitBodySchema,
  previewBodySchema,
  templateQuerySchema,
  type TemplateQuery,
} from './import.dto.js';
import {
  IMPORT_RATE_LIMIT,
  MULTER_LIMITS,
  type ImportCommitResult,
  type ImportReport,
} from './import.constants.js';
import { UserImportService } from './user-import.service.js';

// Sin `storage`: multer guarda el archivo en memoria (nunca en disco, Decisión 5).
const fileInterceptor = FileInterceptor('file', { limits: MULTER_LIMITS });

/** Borra el contenido del archivo de la memoria del proceso (datos de menores, Decisión 5). */
const wipe = (file: UploadedImportFile | undefined): void => {
  if (file && Buffer.isBuffer(file.buffer)) file.buffer.fill(0);
};

// RF-21: importación masiva de usuarios. Solo ADMIN activo. Los guards (límite global, rol y
// ActiveActorGuard) corren antes que el interceptor de multer: sin sesión no se lee el archivo.
// Los campos del multipart se validan dentro del try para borrar siempre el buffer.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('users/import')
export class UserImportController {
  constructor(private readonly service: UserImportService) {}

  @Get('template')
  async template(
    @Query(new ZodValidationPipe(templateQuerySchema)) query: TemplateQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.template(query.type, query.format);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
      length: file.body.length,
    });
  }

  @Post('preview')
  @HttpCode(200)
  @Throttle(IMPORT_RATE_LIMIT)
  @UseInterceptors(fileInterceptor)
  async preview(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body() body: unknown,
  ): Promise<ImportReport> {
    try {
      const { type } = new ZodValidationPipe(previewBodySchema).transform(body ?? {});
      return await this.service.preview(type, file);
    } finally {
      wipe(file);
    }
  }

  @Post('commit')
  @Throttle(IMPORT_RATE_LIMIT)
  @UseInterceptors(fileInterceptor)
  async commit(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body() body: unknown,
    @Req() req: RequestWithUser,
  ): Promise<ImportCommitResult> {
    try {
      const { type, sha256 } = new ZodValidationPipe(commitBodySchema).transform(body ?? {});
      return await this.service.commit(type, sha256, file, actorOf(req));
    } finally {
      wipe(file);
    }
  }
}
