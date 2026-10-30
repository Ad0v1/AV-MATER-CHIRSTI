import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { DEFAULT_LITERAL_SCALE, validateLiteralScale, type LiteralScale } from '@aula/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';

// Tabla de literales configurada (RF-61, RN-04) para el registro y los reportes. Lee la fila
// única de InstitutionSettings (id = 1, U11). Si la fila falta, la BD falla o la tabla guardada
// no pasa validateLiteralScale, usa DEFAULT_LITERAL_SCALE: nunca deja sin literal un promedio.
// Caché corta por proceso; SettingsService la invalida al guardar. El worker ve el cambio, a lo
// más, CACHE_MS después.

export const LITERAL_SCALE_CACHE_MS = 10_000;

@Injectable()
export class LiteralScaleProvider {
  private readonly logger = new Logger(LiteralScaleProvider.name);
  private cached: { scale: LiteralScale; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Tabla vigente (validada) o la tabla por defecto. Nunca lanza. */
  async current(now: number = Date.now()): Promise<LiteralScale> {
    if (this.cached && now - this.cached.at < LITERAL_SCALE_CACHE_MS) return this.cached.scale;
    const scale = await this.load();
    this.cached = { scale, at: now };
    return scale;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async load(): Promise<LiteralScale> {
    try {
      const row = await this.prisma.institutionSettings.findUnique({
        where: { id: 1 },
        select: { literalScale: true },
      });
      if (!row) {
        this.logger.warn('Falta la fila de InstitutionSettings: se usa la tabla por defecto');
        return DEFAULT_LITERAL_SCALE;
      }
      const scale = toScale(row.literalScale);
      if (scale && validateLiteralScale(scale).length === 0) return scale;
      this.logger.error('La tabla de literales guardada no es válida: se usa la tabla por defecto');
      return DEFAULT_LITERAL_SCALE;
    } catch (error) {
      this.logger.error(
        `No se pudo leer la tabla de literales: ${error instanceof Error ? error.name : typeof error}`,
      );
      return DEFAULT_LITERAL_SCALE;
    }
  }
}

/** JSON de la BD → LiteralScale congelada, o null si no tiene la forma. */
export function toScale(value: unknown): LiteralScale | null {
  if (!Array.isArray(value)) return null;
  const bands = [];
  for (const b of value as unknown[]) {
    if (typeof b !== 'object' || b === null) return null;
    const { literal, min, max } = b as Record<string, unknown>;
    if (typeof literal !== 'string' || typeof min !== 'number' || typeof max !== 'number') {
      return null;
    }
    bands.push(Object.freeze({ literal, min, max }));
  }
  return Object.freeze(bands);
}

// Global: lo inyectan GradebookReadService (Dev 4, autorizado el 30/10/2026) y los reportes sin
// que grading.module.ts tenga que importarlo. Registrado en AppModule.
@Global()
@Module({ providers: [LiteralScaleProvider], exports: [LiteralScaleProvider] })
export class LiteralScaleModule {}
