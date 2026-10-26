import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit/audit.module.js';
import { RolesGuard } from './common/auth/roles.guard.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { SessionMiddleware } from './common/session/session.middleware.js';
import { SessionModule } from './common/session/session.module.js';
import { ConfigModule, ENV, type Env } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { AcademicModule } from './modules/academic/academic.module.js';
import { AuthController } from './modules/auth/auth.controller.js';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => [{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }],
    }),
    PrismaModule,
    AuditModule,
    SessionModule,
    AcademicModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    // Orden: primero el limite de peticiones, luego los permisos por rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
