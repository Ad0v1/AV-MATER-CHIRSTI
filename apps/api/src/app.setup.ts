import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export const API_PREFIX = 'api/v1';

/**
 * Límite del cuerpo JSON (por defecto, 100 KB en Express). Se sube a 512 KB para que quepa una
 * promoción en bloque de hasta 2000 decisiones (RF-16, unos 250 KB).
 * Cambio autorizado por el usuario el 29/10/2026 (Decisión del orquestador 5, F6 de Dev 2);
 * PENDIENTE DE REVISIÓN por Dev 1, dueño de este archivo.
 */
export const JSON_BODY_LIMIT = '512kb';

export function configureApp(
  app: INestApplication,
  webOrigin = 'http://localhost:3000',
  trustProxy = 0,
): void {
  // Solo se confia en X-Forwarded-For si hay un proxy propio delante; si no, cualquiera podria falsearlo.
  if (trustProxy > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  app.setGlobalPrefix(API_PREFIX);
  // Antes de app.init(): Nest no registra su parser JSON por defecto si ya hay uno.
  (app as NestExpressApplication).useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.use(helmet());
  app.use(cookieParser());
  // Las cookies de sesion viajan solo desde el origen del frontend (RNF-05/07).
  app.enableCors({ origin: webOrigin, credentials: true });
}
