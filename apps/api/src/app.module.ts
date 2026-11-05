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
import { UsersModule } from './modules/users/users.module.js';
// Módulos de Dev 3, registrados con autorización del usuario (29/10/2026); pendiente de revisión por Dev 1.
import { ContentsModule } from './modules/contents/contents.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { AuthService } from './modules/auth/auth.service.js';
import { DniService } from './modules/auth/dni.service.js';
import { LoginAttemptsService } from './modules/auth/login-attempts.service.js';
import { PasswordService } from './modules/auth/password.service.js';
import { TotpService } from './modules/auth/totp.service.js';
import { UserCodeService } from './modules/auth/user-code.service.js';
import { PasswordChangeGuard } from './common/auth/password-change.guard.js';

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
    UsersModule,
    FilesModule,
    ContentsModule,
    SubmissionsModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    AuthService,
    PasswordService,
    TotpService,
    LoginAttemptsService,
    DniService,
    UserCodeService,
    // Orden: primero el limite de peticiones, luego los permisos por rol y, al final, el cambio
    // de contrasena pendiente (RF-71).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
