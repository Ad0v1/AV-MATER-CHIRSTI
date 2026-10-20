import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication, webOrigin = 'http://localhost:3000'): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  // Las cookies de sesion viajan solo desde el origen del frontend (RNF-05/07).
  app.enableCors({ origin: webOrigin, credentials: true });
}
