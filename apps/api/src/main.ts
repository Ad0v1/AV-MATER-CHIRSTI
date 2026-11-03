import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadDotenv } from './config/dotenv.js';
import { loadEnv } from './config/env.js';

// Debe ir antes de leer la configuracion.
loadDotenv();

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app, env.WEB_ORIGIN, env.TRUST_PROXY);
  await app.listen(env.API_PORT);
}
await bootstrap();
