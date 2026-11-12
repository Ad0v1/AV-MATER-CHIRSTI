import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { type LiteralScale } from '@aula/shared';
import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../academic/request-user.js';
import { FileScanner, ScannerUnavailableError } from '../files/file-scanner.js';
import {
  buildLogoKey,
  InstitutionLogoStorage,
  isLogoKey,
  type LogoUrl,
} from './institution-logo.storage.js';
import { LiteralScaleProvider, toScale } from './literal-scale.provider.js';
import { checkLogo, LOGO_MAX_BYTES, LOGO_MIME } from './logo-image.js';
import { recordSettings } from './settings-audit.js';
import { assertValidScale, sortScale, type UpdateSettingsDto } from './settings.dto.js';

// Configuración institucional (RF-61, U5, U11). Fila única id = 1 que inserta la migración
// admin_base: aquí solo se lee con where { id: 1 } y se actualiza; nunca se crea ni se borra.

export type LogoView = { mime: string } & LogoUrl;

export type SettingsView = {
  name: string;
  literalScale: LiteralScale;
  purgeAfterDays: number;
  logo: LogoView | null;
  updatedAt: string;
};

export type BrandingView = { name: string; logo: LogoView | null };

/** Archivo que deja multer en memoria (sin @types/multer; mismo tipo mínimo que Dev 2). */
export type UploadedLogo = { size: number; buffer: Buffer };

type SettingsRow = {
  name: string;
  logoObjectKey: string | null;
  logoMime: string | null;
  literalScale: unknown;
  purgeAfterDays: number;
  updatedAt: Date;
};

const rowSelect = {
  name: true,
  logoObjectKey: true,
  logoMime: true,
  literalScale: true,
  purgeAfterDays: true,
  updatedAt: true,
} as const;

const MSG = {
  missing: 'La configuración institucional no está inicializada',
  fileRequired: 'Adjunta la imagen del logo',
  empty: 'El archivo está vacío',
  tooLarge: `El logo supera ${LOGO_MAX_BYTES / 1024} KiB`,
  unsupported: 'El logo debe ser una imagen PNG o JPEG',
  invalid: 'La imagen está dañada o supera 4096 píxeles de lado',
  infected: 'El antivirus bloqueó el archivo. No se guardó',
  scanner: 'El antivirus no está disponible. Intenta de nuevo en unos minutos.',
  storage: 'El almacenamiento no está disponible. Intenta de nuevo en unos minutos.',
} as const;

const sameScale = (a: LiteralScale, b: LiteralScale): boolean =>
  JSON.stringify(sortScale(a)) === JSON.stringify(sortScale(b));

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scanner: FileScanner,
    private readonly logos: InstitutionLogoStorage,
    private readonly scales: LiteralScaleProvider,
  ) {}

  /** GET /admin/settings (ADMIN). */
  async get(): Promise<SettingsView> {
    return this.view(await this.read());
  }

  /** GET /institution/branding (cualquier usuario autenticado): nombre y logo. */
  async branding(): Promise<BrandingView> {
    const row = await this.read();
    return { name: row.name, logo: await this.logoView(row) };
  }

  /** PUT /admin/settings (ADMIN). Bitácora settings.update solo si algo cambió. */
  async update(dto: UpdateSettingsDto, actor: Actor): Promise<SettingsView> {
    assertValidScale(dto.literalScale);
    const scale = sortScale(dto.literalScale);

    const { after } = await this.prisma.$transaction(async (tx) => {
      // Bloqueo de la fila: dos ADMIN que guardan a la vez no mezclan cambios en la bitácora.
      const exists = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM InstitutionSettings WHERE id = 1 FOR UPDATE`;
      if (exists.length === 0) {
        throw new InternalServerErrorException({ code: 'SETTINGS_MISSING', message: MSG.missing });
      }
      const locked = await tx.institutionSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: rowSelect,
      });
      const updated = await tx.institutionSettings.update({
        where: { id: 1 },
        data: {
          name: dto.name,
          literalScale: scale as unknown as Prisma.InputJsonValue,
          purgeAfterDays: dto.purgeAfterDays,
          updatedById: actor.id,
        },
        select: rowSelect,
      });

      // D-047: la bitácora va en la misma transacción que el cambio.
      const previousScale = toScale(locked.literalScale) ?? [];
      const changed: string[] = [];
      if (locked.name !== updated.name) changed.push('name');
      if (!sameScale(previousScale, scale)) changed.push('literalScale');
      if (locked.purgeAfterDays !== updated.purgeAfterDays) changed.push('purgeAfterDays');
      if (changed.length > 0) {
        const pick = (row: SettingsRow, s: LiteralScale) => ({
          ...(changed.includes('literalScale') ? { literalScale: sortScale(s) } : {}),
          ...(changed.includes('purgeAfterDays') ? { purgeAfterDays: row.purgeAfterDays } : {}),
        });
        await recordSettings(
          this.audit,
          actor,
          'settings.update',
          {
            before: { changedFields: changed, ...pick(locked, previousScale) },
            after: { changedFields: changed, ...pick(updated, scale) },
          },
          tx,
        );
      }
      return { before: locked, after: updated };
    });
    this.scales.invalidate();
    return this.view(after);
  }

  /**
   * PUT /admin/settings/logo (ADMIN, U5). Orden: bytes (PNG/JPEG, ≤ 512 KiB) → antivirus →
   * subida a institution/<uuid>.<ext> → fila (bloqueada) → borrado del logo anterior. Si la fila
   * no se puede actualizar se borra el objeto nuevo; si falla el borrado del anterior queda en el
   * log (huérfano en institution/, sin datos personales).
   */
  async uploadLogo(file: UploadedLogo | undefined, actor: Actor): Promise<SettingsView> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: MSG.fileRequired });
    }
    const check = checkLogo(file.buffer);
    if (!check.ok) {
      switch (check.reason) {
        case 'EMPTY':
          throw new BadRequestException({ code: 'EMPTY_FILE', message: MSG.empty });
        case 'TOO_LARGE':
          throw new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE', message: MSG.tooLarge });
        case 'UNSUPPORTED':
          throw new UnsupportedMediaTypeException({
            code: 'UNSUPPORTED_IMAGE',
            message: MSG.unsupported,
          });
        default:
          throw new UnsupportedMediaTypeException({ code: 'INVALID_IMAGE', message: MSG.invalid });
      }
    }

    await this.scan(file.buffer);

    const key = buildLogoKey(check.format);
    const mime = LOGO_MIME[check.format];
    try {
      await this.logos.upload(key, file.buffer);
    } catch (error) {
      this.logger.error(`No se pudo subir el logo: ${describe(error)}`);
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: MSG.storage });
    }

    let previousKey: string | null;
    let row: SettingsRow;
    try {
      ({ previousKey, row } = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ logoObjectKey: string | null }[]>`
          SELECT logoObjectKey FROM InstitutionSettings WHERE id = 1 FOR UPDATE`;
        if (locked.length === 0) {
          throw new InternalServerErrorException({
            code: 'SETTINGS_MISSING',
            message: MSG.missing,
          });
        }
        const updated = await tx.institutionSettings.update({
          where: { id: 1 },
          data: { logoObjectKey: key, logoMime: mime, updatedById: actor.id },
          select: rowSelect,
        });
        // D-047: la bitácora va en la misma transacción que la fila.
        await recordSettings(
          this.audit,
          actor,
          'settings.logo.update',
          {
            before: { hadLogo: locked[0].logoObjectKey !== null },
            after: {
              mime,
              sizeBytes: file.buffer.length,
              width: check.width,
              height: check.height,
              sha256: createHash('sha256').update(file.buffer).digest('hex'),
            },
          },
          tx,
        );
        return { previousKey: locked[0].logoObjectKey, row: updated };
      }));
    } catch (error) {
      await this.safeDelete(key);
      throw error;
    }

    if (previousKey && previousKey !== key) await this.safeDelete(previousKey);

    return this.view(row);
  }

  // ---------------------------------------------------------------------------

  private async read(): Promise<SettingsRow> {
    const row = await this.prisma.institutionSettings.findUnique({
      where: { id: 1 },
      select: rowSelect,
    });
    if (!row) {
      this.logger.error('Falta la fila InstitutionSettings id = 1 (migración admin_base)');
      throw new InternalServerErrorException({ code: 'SETTINGS_MISSING', message: MSG.missing });
    }
    return row;
  }

  private async view(row: SettingsRow): Promise<SettingsView> {
    return {
      name: row.name,
      literalScale: sortScale(toScale(row.literalScale) ?? []),
      purgeAfterDays: row.purgeAfterDays,
      logo: await this.logoView(row),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** URL firmada del logo, o null si no hay o no se pudo firmar (la página sigue sin logo). */
  private async logoView(row: SettingsRow): Promise<LogoView | null> {
    if (!row.logoObjectKey || !row.logoMime || !isLogoKey(row.logoObjectKey)) return null;
    try {
      return {
        mime: row.logoMime,
        ...(await this.logos.signedUrl(row.logoObjectKey, row.logoMime)),
      };
    } catch (error) {
      this.logger.error(`No se pudo firmar la URL del logo: ${describe(error)}`);
      return null;
    }
  }

  private async scan(buffer: Buffer): Promise<void> {
    let result;
    try {
      result = await this.scanner.scan(Readable.from([buffer]));
    } catch (error) {
      if (error instanceof ScannerUnavailableError) {
        this.logger.warn('Antivirus no disponible al subir el logo');
        throw new ServiceUnavailableException({
          code: 'SCANNER_UNAVAILABLE',
          message: MSG.scanner,
        });
      }
      throw error;
    }
    if (result.status === 'INFECTED') {
      this.logger.warn(`Logo bloqueado por el antivirus: ${result.signature}`);
      throw new UnprocessableEntityException({ code: 'FILE_INFECTED', message: MSG.infected });
    }
    if (result.status === 'TOO_LARGE') {
      throw new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE', message: MSG.tooLarge });
    }
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.logos.delete(key);
    } catch (error) {
      this.logger.error(`No se pudo borrar el logo ${key}: ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
