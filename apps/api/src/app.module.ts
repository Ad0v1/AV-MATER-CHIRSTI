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
import { GradingModule } from './modules/grading/grading.module.js';
// Colas y trabajos de Dev 5 (RNF-19), registrados con autorización del usuario (30/10/2026).
import { JobsModule } from './modules/jobs/jobs.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
// Configuración institucional (RF-61) y calendario (RF-54) de Dev 5, autorizados el 30/10/2026.
import { CalendarModule } from './modules/notifications/calendar.module.js';
import { LiteralScaleModule } from './modules/settings/literal-scale.provider.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { AuthService } from './modules/auth/auth.service.js';
import { CredentialsModule } from './modules/auth/credentials.module.js';
import { RecoveryCodesService } from './modules/auth/recovery-codes.service.js';
import { TotpService } from './modules/auth/totp.service.js';
import { PendingSetupGuard } from './common/auth/pending-setup.guard.js';
import { MailModule } from './common/mail/mail.module.js';
import { EmailVerificationService } from './modules/auth/email-verification.service.js';
import { OneTimeCodeService } from './modules/auth/one-time-code.service.js';
import { PasswordRecoveryService } from './modules/auth/password-recovery.service.js';

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
    MailModule,
    CredentialsModule,
    AcademicModule,
    UsersModule,
    FilesModule,
    ContentsModule,
    SubmissionsModule,
    GradingModule,
    QueueModule,
    JobsModule,
    LiteralScaleModule,
    SettingsModule,
    CalendarModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    AuthService,
    TotpService,
    RecoveryCodesService,
    OneTimeCodeService,
    EmailVerificationService,
    PasswordRecoveryService,
    // Orden: primero el limite de peticiones, luego los permisos por rol y, al final, los pasos
    // pendientes del primer ingreso (RF-71, RN-18).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PendingSetupGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
