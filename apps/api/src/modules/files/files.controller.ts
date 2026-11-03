import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { idSchema } from '../academic/academic.dto.js';
import { actorOf, currentUser, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import {
  downloadUrlSchema,
  uploadIntentSchema,
  type CompleteResponse,
  type DownloadUrlDto,
  type DownloadUrlResponse,
  type UploadIntentDto,
  type UploadIntentResponse,
} from './files.dto.js';
import { FilesService } from './files.service.js';
import { COMPLETE_THROTTLE, UPLOAD_INTENT_THROTTLE } from './files-throttle.js';

// RF-33..35, RF-40, RNF-03/18. El apoderado no sube ni descarga archivos (403 por rol).
// La pertenencia, el plazo y el período se validan en FilesService.
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-intents')
  @Throttle(UPLOAD_INTENT_THROTTLE)
  createUploadIntent(
    @Body(new ZodValidationPipe(uploadIntentSchema)) dto: UploadIntentDto,
    @Req() req: RequestWithUser,
  ): Promise<UploadIntentResponse> {
    return this.files.createUploadIntent(currentUser(req), dto, actorOf(req));
  }

  @Post(':id/complete')
  @Throttle(COMPLETE_THROTTLE)
  @HttpCode(200)
  complete(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithUser,
  ): Promise<CompleteResponse> {
    return this.files.complete(currentUser(req), id, actorOf(req));
  }

  @Post(':id/download-url')
  @HttpCode(200)
  createDownloadUrl(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(downloadUrlSchema)) dto: DownloadUrlDto,
    @Req() req: RequestWithUser,
  ): Promise<DownloadUrlResponse> {
    return this.files.createDownloadUrl(currentUser(req), id, dto, actorOf(req));
  }
}
