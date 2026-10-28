import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export const API_PREFIX = 'api/v1';

export function configureApp(
  app: INestApplication,
  webOrigin = 'http://localhost:3000',
  trustProxy = 0,
): void {
  // Solo se confia en X-Forwarded-For si hay un proxy propio delante; si no, cualquiera podria falsearlo.
  if (trustProxy > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  // Las cookies de sesion viajan solo desde el origen del frontend (RNF-05/07).
  app.enableCors({ origin: webOrigin, credentials: true });
}
