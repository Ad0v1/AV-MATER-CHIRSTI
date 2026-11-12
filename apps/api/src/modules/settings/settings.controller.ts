import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/auth/roles.decorator.js';
import { USER_ROLES } from '../../common/auth/roles.js';
import { actorOf, type RequestWithUser } from '../academic/request-user.js';
import { ZodValidationPipe } from '../academic/zod-validation.pipe.js';
import { trackByUser } from '../files/files-throttle.js';
import { ActiveActorGuard } from '../users/active-actor.guard.js';
import { LOGO_MAX_BYTES } from './logo-image.js';
import { updateSettingsSchema, type UpdateSettingsDto } from './settings.dto.js';
import {
  SettingsService,
  type BrandingView,
  type SettingsView,
  type UploadedLogo,
} from './settings.service.js';

// Sin `storage`: multer deja el archivo en memoria. Un solo archivo `file` y ningún otro campo.
// Los guards (límite global, rol y ActiveActorGuard) corren antes: sin sesión no se lee el cuerpo.
const logoInterceptor = FileInterceptor('file', {
  limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 0, parts: 1 },
});

/** 10 subidas de logo por minuto y ADMIN (cada una pasa por el antivirus). */
const LOGO_THROTTLE = { default: { limit: 10, ttl: 60_000, getTracker: trackByUser } };

/** 30 guardados por minuto y ADMIN (seguridad 5c): cada uno bloquea la fila y deja bitácora. */
export const SETTINGS_THROTTLE = { default: { limit: 30, ttl: 60_000, getTracker: trackByUser } };

// RF-61: configuración institucional. Solo ADMIN activo (ActiveActorGuard de Dev 2).
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<SettingsView> {
    return this.settings.get();
  }

  @Put()
  @Throttle(SETTINGS_THROTTLE)
  update(
    @Body(new ZodValidationPipe(updateSettingsSchema)) dto: UpdateSettingsDto,
    @Req() req: RequestWithUser,
  ): Promise<SettingsView> {
    return this.settings.update(dto, actorOf(req));
  }

  @Put('logo')
  @Throttle(LOGO_THROTTLE)
  @UseInterceptors(logoInterceptor)
  uploadLogo(
    @UploadedFile() file: UploadedLogo | undefined,
    @Req() req: RequestWithUser,
  ): Promise<SettingsView> {
    return this.settings.uploadLogo(file, actorOf(req));
  }
}

// Nombre y logo para la cabecera de la web: cualquier usuario con sesión (los cuatro roles).
@Roles(...USER_ROLES)
@Controller('institution/branding')
export class BrandingController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<BrandingView> {
    return this.settings.branding();
  }
}
